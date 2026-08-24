import { describe, expect, test } from 'bun:test'
import { Context, Effect, Layer, Ref, Schema as S } from 'effect'

import {
  CannotRevokeCurrentSession,
  SessionLifecycle,
  SessionLifecycleCancelled,
  SessionLifecycleLayer,
  SessionAuthenticationExpired,
  SessionProvider,
  type SessionProviderApi,
  type SessionProviderFailure,
  SessionProviderUnavailable,
} from '~/application/session-lifecycle'
import { SessionId, type UserId } from '~/domain/identity'
import {
  parseSessionActor,
  SessionRecord,
  type SessionActor,
  type SessionRecord as SessionRecordType,
} from '~/domain/session'
import type { SessionToken } from '~/domain/auth-credentials'

interface RecordingSessionProviderApi extends SessionProviderApi {
  readonly listedOwners: () => Effect.Effect<ReadonlyArray<UserId>>
  readonly revokedTokens: () => Effect.Effect<ReadonlyArray<SessionToken>>
}

class RecordingSessionProvider extends Context.Service<
  RecordingSessionProvider,
  RecordingSessionProviderApi
>()('@test/RecordingSessionProvider') {}

function recordingProviderLayer(
  sessions: ReadonlyArray<SessionRecordType>,
  options: {
    readonly afterList?: () => void
    readonly afterRevoke?: (token: SessionToken, attempt: number) => void
    readonly revokeFailure?: SessionProviderFailure
    readonly revokeFailureAtAttempt?: number
  } = {}
) {
  return Layer.effectContext(
    Effect.gen(function* () {
      const owners = yield* Ref.make<ReadonlyArray<UserId>>([])
      const tokens = yield* Ref.make<ReadonlyArray<SessionToken>>([])
      const activeSessions = yield* Ref.make(sessions)

      const service = RecordingSessionProvider.of({
        listOwned: Effect.fn('RecordingSessionProvider.listOwned')(
          function* (ownerId) {
            yield* Ref.update(owners, (values) => [...values, ownerId])
            options.afterList?.()
            return yield* Ref.get(activeSessions)
          }
        ),
        revoke: Effect.fn('RecordingSessionProvider.revoke')(function* (
          token
        ) {
          yield* Ref.update(tokens, (values) => [...values, token])
          const attempt = (yield* Ref.get(tokens)).length
          if (
            options.revokeFailure !== undefined &&
            (options.revokeFailureAtAttempt === undefined ||
              options.revokeFailureAtAttempt === attempt)
          ) {
            return yield* options.revokeFailure
          }
          yield* Ref.update(activeSessions, (values) =>
            values.filter((session) => session.token !== token)
          )
          options.afterRevoke?.(token, attempt)
        }),
        listedOwners: Effect.fn('RecordingSessionProvider.listedOwners')(
          function* () {
            return yield* Ref.get(owners)
          }
        ),
        revokedTokens: Effect.fn('RecordingSessionProvider.revokedTokens')(
          function* () {
            return yield* Ref.get(tokens)
          }
        ),
      })

      return Context.empty().pipe(
        Context.add(SessionProvider, service),
        Context.add(RecordingSessionProvider, service)
      )
    })
  )
}

function lifecycleLayer(
  sessions: ReadonlyArray<SessionRecordType>,
  options: Parameters<typeof recordingProviderLayer>[1] = {}
) {
  return SessionLifecycleLayer.pipe(
    Layer.provideMerge(recordingProviderLayer(sessions, options))
  )
}

function makeActor(): Effect.Effect<SessionActor> {
  return parseSessionActor({
    user: { id: 'user-123' },
    session: {
      id: 'session-current',
      userId: 'user-123',
      token: S.decodeUnknownSync(S.RedactedFromValue(S.String))(
        'current-token'
      ),
    },
  }).pipe(Effect.orDie)
}

function makeSession(
  id: string,
  token: string,
  userId = 'user-123'
): Effect.Effect<SessionRecordType> {
  return S.decodeUnknownEffect(SessionRecord)({
    id,
    createdAt: new Date('2026-08-19T09:00:00.000Z'),
    updatedAt: new Date('2026-08-19T10:00:00.000Z'),
    userId,
    expiresAt: new Date('2026-08-26T09:00:00.000Z'),
    token,
    ipAddress: null,
    userAgent: null,
  }).pipe(Effect.orDie)
}

function makeSessionId(id: string) {
  return S.decodeUnknownSync(SessionId)(id)
}

describe('session lifecycle', () => {
  test('lists only token-free sessions and marks the current session', async () => {
    const actor = await Effect.runPromise(makeActor())
    const current = await Effect.runPromise(
      makeSession('session-current', 'current-token')
    )
    const other = await Effect.runPromise(
      makeSession('session-other', 'other-token')
    )
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider

        return {
          sessions: yield* lifecycle.list(actor),
          owners: yield* recording.listedOwners(),
        }
      }).pipe(Effect.provide(lifecycleLayer([current, other])))
    )
    const first = result.sessions.at(0)

    expect(result.sessions.map((session) => session.isCurrent)).toEqual([
      true,
      false,
    ])
    expect(result.owners.map(String)).toEqual(['user-123'])
    expect(first).toBeDefined()

    if (first !== undefined) {
      expect('token' in first).toBe(false)
      expect('userId' in first).toBe(false)
    }
  })

  test('rejects the current target before consulting the provider', async () => {
    const actor = await Effect.runPromise(makeActor())
    const errorAndRecords = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider
        const error = yield* Effect.flip(
          lifecycle.revokeOne(actor, actor.currentSessionId)
        )

        return {
          error,
          owners: yield* recording.listedOwners(),
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(Effect.provide(lifecycleLayer([])))
    )

    expect(errorAndRecords.error).toBeInstanceOf(CannotRevokeCurrentSession)
    expect(errorAndRecords.owners).toEqual([])
    expect(errorAndRecords.tokens).toEqual([])
  })

  test('treats an already inactive target as idempotent success', async () => {
    const actor = await Effect.runPromise(makeActor())
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider

        return {
          outcome: yield* lifecycle.revokeOne(
            actor,
            makeSessionId('session-missing')
          ),
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(Effect.provide(lifecycleLayer([])))
    )

    expect(result.outcome._tag).toBe('AlreadyInactive')
    expect(result.tokens).toEqual([])
  })

  test('revokes an owned non-current session through the provider seam', async () => {
    const actor = await Effect.runPromise(makeActor())
    const target = await Effect.runPromise(
      makeSession('session-other', 'other-token')
    )
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider

        return {
          outcome: yield* lifecycle.revokeOne(actor, target.id),
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(Effect.provide(lifecycleLayer([target])))
    )

    expect(result.outcome._tag).toBe('Revoked')
    expect(result.tokens).toEqual([target.token])
  })

  test('lists once and sequentially revokes every non-current session', async () => {
    const actor = await Effect.runPromise(makeActor())
    const current = await Effect.runPromise(
      makeSession('session-current', 'current-token')
    )
    const newest = await Effect.runPromise(
      makeSession('session-newest', 'newest-token')
    )
    const oldest = await Effect.runPromise(
      makeSession('session-oldest', 'oldest-token')
    )
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider

        yield* lifecycle.revokeOthers(actor)
        return {
          owners: yield* recording.listedOwners(),
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(Effect.provide(lifecycleLayer([newest, current, oldest])))
    )

    expect(result.owners.map(String)).toEqual(['user-123'])
    expect(result.tokens).toEqual([newest.token, oldest.token])
  })

  test('re-lists only remaining sessions when retrying a partial revoke', async () => {
    const actor = await Effect.runPromise(makeActor())
    const current = await Effect.runPromise(
      makeSession('session-current', 'current-token')
    )
    const first = await Effect.runPromise(
      makeSession('session-first', 'first-token')
    )
    const second = await Effect.runPromise(
      makeSession('session-second', 'second-token')
    )
    const third = await Effect.runPromise(
      makeSession('session-third', 'third-token')
    )
    const failure = new SessionProviderUnavailable({
      operation: 'revokeSession',
      status: 503,
    })
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider
        const firstError = yield* Effect.flip(lifecycle.revokeOthers(actor))

        yield* lifecycle.revokeOthers(actor)

        return {
          firstError,
          owners: yield* recording.listedOwners(),
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(
        Effect.provide(
          lifecycleLayer([current, first, second, third], {
            revokeFailure: failure,
            revokeFailureAtAttempt: 2,
          })
        )
      )
    )

    expect(result.firstError).toBe(failure)
    expect(result.owners.map(String)).toEqual(['user-123', 'user-123'])
    expect(result.tokens).toEqual([
      first.token,
      second.token,
      second.token,
      third.token,
    ])
  })

  test('authoritatively revokes the current provider session', async () => {
    const actor = await Effect.runPromise(makeActor())
    const current = await Effect.runPromise(
      makeSession('session-current', 'provider-current-token')
    )
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider

        return {
          outcome: yield* lifecycle.endCurrent(actor),
          owners: yield* recording.listedOwners(),
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(Effect.provide(lifecycleLayer([current])))
    )

    expect(result.outcome._tag).toBe('Revoked')
    expect(result.owners).toEqual([])
    expect(result.tokens).toEqual([actor.currentToken])
  })

  test('treats an expired current provider session as already inactive', async () => {
    const actor = await Effect.runPromise(makeActor())
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider
        return {
          outcome: yield* lifecycle.endCurrent(actor),
          owners: yield* recording.listedOwners(),
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(
        Effect.provide(
          lifecycleLayer([], {
            revokeFailure: new SessionAuthenticationExpired({
              operation: 'revokeSession',
            }),
          })
        )
      )
    )

    expect(result.outcome._tag).toBe('AlreadyInactive')
    expect(result.owners).toEqual([])
    expect(result.tokens).toEqual([actor.currentToken])
  })

  test('stops before consulting the provider when already cancelled', async () => {
    const actor = await Effect.runPromise(makeActor())
    const controller = new AbortController()
    controller.abort('private-reason')

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider
        const error = yield* Effect.flip(
          lifecycle.list(actor, { signal: controller.signal })
        )

        return {
          error,
          owners: yield* recording.listedOwners(),
        }
      }).pipe(Effect.provide(lifecycleLayer([])))
    )

    expect(result.error).toBeInstanceOf(SessionLifecycleCancelled)
    expect(result.error.operation).toBe('list')
    expect(JSON.stringify(result.error)).not.toContain('private-reason')
    expect(result.owners).toEqual([])
  })

  test('checks cancellation after a provider read completes', async () => {
    const actor = await Effect.runPromise(makeActor())
    const controller = new AbortController()

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        return yield* Effect.flip(
          lifecycle.list(actor, { signal: controller.signal })
        )
      }).pipe(
        Effect.provide(
          lifecycleLayer([], {
            afterList: () => controller.abort(),
          })
        )
      )
    )

    expect(error).toBeInstanceOf(SessionLifecycleCancelled)
    expect(error.operation).toBe('list')
  })

  test('reports post-revoke cancellation after the idempotent mutation', async () => {
    const actor = await Effect.runPromise(makeActor())
    const target = await Effect.runPromise(
      makeSession('session-other', 'other-token')
    )
    const controller = new AbortController()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider
        const error = yield* Effect.flip(
          lifecycle.revokeOne(actor, target.id, {
            signal: controller.signal,
          })
        )

        return {
          error,
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(
        Effect.provide(
          lifecycleLayer([target], {
            afterRevoke: () => controller.abort(),
          })
        )
      )
    )

    expect(result.error).toBeInstanceOf(SessionLifecycleCancelled)
    if (!(result.error instanceof SessionLifecycleCancelled)) {
      throw new Error('Expected lifecycle cancellation after revoke')
    }
    expect(result.error.operation).toBe('revokeOne')
    expect(result.tokens).toEqual([target.token])
  })

  test('stops between sequential revoke-others mutations after cancellation', async () => {
    const actor = await Effect.runPromise(makeActor())
    const current = await Effect.runPromise(
      makeSession('session-current', 'current-token')
    )
    const first = await Effect.runPromise(
      makeSession('session-first', 'first-token')
    )
    const second = await Effect.runPromise(
      makeSession('session-second', 'second-token')
    )
    const controller = new AbortController()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider
        const error = yield* Effect.flip(
          lifecycle.revokeOthers(actor, { signal: controller.signal })
        )

        return {
          error,
          owners: yield* recording.listedOwners(),
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(
        Effect.provide(
          lifecycleLayer([current, first, second], {
            afterRevoke: () => controller.abort(),
          })
        )
      )
    )

    expect(result.error).toBeInstanceOf(SessionLifecycleCancelled)
    expect(result.error.operation).toBe('revokeOthers')
    expect(result.owners.map(String)).toEqual(['user-123'])
    expect(result.tokens).toEqual([first.token])
  })

  test('reports post-logout cancellation after directly revoking current', async () => {
    const actor = await Effect.runPromise(makeActor())
    const controller = new AbortController()

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const lifecycle = yield* SessionLifecycle
        const recording = yield* RecordingSessionProvider
        const error = yield* Effect.flip(
          lifecycle.endCurrent(actor, { signal: controller.signal })
        )

        return {
          error,
          owners: yield* recording.listedOwners(),
          tokens: yield* recording.revokedTokens(),
        }
      }).pipe(
        Effect.provide(
          lifecycleLayer([], {
            afterRevoke: () => controller.abort(),
          })
        )
      )
    )

    expect(result.error).toBeInstanceOf(SessionLifecycleCancelled)
    expect(result.error.operation).toBe('endCurrent')
    expect(result.owners).toEqual([])
    expect(result.tokens).toEqual([actor.currentToken])
  })
})
