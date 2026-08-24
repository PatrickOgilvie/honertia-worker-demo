import { describe, expect, test } from 'bun:test'
import { Effect, Redacted, Schema as S } from 'effect'

import {
  InvalidSessionProviderResponse,
  SessionProvider,
  type SessionProviderApi,
  SessionProviderCancelled,
  SessionProviderUnavailable,
} from '~/application/session-lifecycle'
import {
  type BetterAuthSessionServer,
  makeBetterAuthSessionsLayer,
} from '~/adapters/better-auth-sessions'
import { SessionToken } from '~/domain/auth-credentials'
import { UserId } from '~/domain/identity'
import { MAX_ACTIVE_SESSIONS } from '~/domain/session'

interface FakeBetterAuthOptions {
  readonly listSessions?: () => Promise<unknown>
  readonly revokeSession?: (token: string) => Promise<unknown>
}

function makeFakeBetterAuth(options: FakeBetterAuthOptions = {}) {
  const revokedTokens: Array<string> = []
  let listSessionsCount = 0
  const auth: BetterAuthSessionServer = {
    api: {
      listSessions: async () => {
        listSessionsCount += 1
        return options.listSessions === undefined
          ? []
          : await options.listSessions()
      },
      revokeSession: async ({ body }) => {
        revokedTokens.push(body.token)

        return options.revokeSession === undefined
          ? { status: true }
          : await options.revokeSession(body.token)
      },
    },
    handler: () => new Response(null, { status: 204 }),
  }

  return {
    auth,
    listSessionsCount: () => listSessionsCount,
    revokedTokens,
  }
}

function providerProgram<A, E>(
  auth: BetterAuthSessionServer,
  use: (provider: SessionProviderApi) => Effect.Effect<A, E>
) {
  return Effect.gen(function* () {
    const provider = yield* SessionProvider
    return yield* use(provider)
  }).pipe(
    Effect.provide(makeBetterAuthSessionsLayer(auth, new Headers()))
  )
}

function providerSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-other',
    createdAt: new Date('2026-08-19T09:00:00.000Z'),
    updatedAt: new Date('2026-08-19T10:00:00.000Z'),
    userId: 'user-123',
    expiresAt: new Date('2026-08-26T09:00:00.000Z'),
    token: 'provider-token',
    ipAddress: null,
    userAgent: null,
    ...overrides,
  }
}

const ownerId = S.decodeUnknownSync(UserId)('user-123')

describe('Better Auth sessions adapter', () => {
  test('parses provider sessions and immediately redacts their tokens', async () => {
    const fake = makeFakeBetterAuth({
      listSessions: async () => [providerSession()],
    })
    const sessions = await Effect.runPromise(
      providerProgram(fake.auth, (provider) => provider.listOwned(ownerId))
    )
    const first = sessions.at(0)

    expect(first).toBeDefined()

    if (first !== undefined) {
      expect(String(first.id)).toBe('session-other')
      expect(Redacted.isRedacted(first.token)).toBe(true)
      expect(String(first.token)).not.toContain('provider-token')
    }
  })

  test('returns the complete bounded session view newest-first', async () => {
    const fake = makeFakeBetterAuth({
      listSessions: async () => [
        providerSession({
          id: 'session-oldest',
          token: 'oldest-token',
          createdAt: new Date('2026-08-19T08:00:00.000Z'),
        }),
        providerSession({
          id: 'session-newest',
          token: 'newest-token',
          createdAt: new Date('2026-08-19T10:00:00.000Z'),
        }),
        providerSession({
          id: 'session-middle',
          token: 'middle-token',
          createdAt: new Date('2026-08-19T09:00:00.000Z'),
        }),
      ],
    })
    const sessions = await Effect.runPromise(
      providerProgram(fake.auth, (provider) => provider.listOwned(ownerId))
    )

    expect(sessions.map((session) => String(session.id))).toEqual([
      'session-newest',
      'session-middle',
      'session-oldest',
    ])
  })

  test('rejects an over-cap provider collection instead of hiding sessions', async () => {
    const fake = makeFakeBetterAuth({
      listSessions: async () =>
        Array.from({ length: MAX_ACTIVE_SESSIONS + 1 }, (_, index) =>
          providerSession({
            id: `session-${index}`,
            token: `provider-token-${index}`,
          })
        ),
    })
    const error = await Effect.runPromise(
      Effect.flip(
        providerProgram(fake.auth, (provider) => provider.listOwned(ownerId))
      )
    )

    expect(error).toBeInstanceOf(InvalidSessionProviderResponse)

    if (error instanceof InvalidSessionProviderResponse) {
      expect(error.reason).toBe('invalid-payload')
    }
  })

  test('rejects a provider session owned by a different user', async () => {
    const fake = makeFakeBetterAuth({
      listSessions: async () => [providerSession({ userId: 'user-456' })],
    })
    const error = await Effect.runPromise(
      Effect.flip(
        providerProgram(fake.auth, (provider) => provider.listOwned(ownerId))
      )
    )

    expect(error).toBeInstanceOf(InvalidSessionProviderResponse)

    if (error instanceof InvalidSessionProviderResponse) {
      expect(error.reason).toBe('owner-mismatch')
    }

    expect(Object.keys(error)).not.toContain('token')
    expect(Object.keys(error)).not.toContain('payload')
    expect(Object.keys(error)).not.toContain('headers')
  })

  test('rejects malformed provider session payloads without retaining them', async () => {
    const fake = makeFakeBetterAuth({
      listSessions: async () => [{ id: 'missing-required-fields' }],
    })
    const error = await Effect.runPromise(
      Effect.flip(
        providerProgram(fake.auth, (provider) => provider.listOwned(ownerId))
      )
    )

    expect(error).toBeInstanceOf(InvalidSessionProviderResponse)

    if (error instanceof InvalidSessionProviderResponse) {
      expect(error.reason).toBe('invalid-payload')
    }

    expect(Object.keys(error)).not.toContain('payload')
  })

  test('unwraps a token only while calling Better Auth revokeSession', async () => {
    const fake = makeFakeBetterAuth()
    const token = S.decodeUnknownSync(SessionToken)('provider-token')

    await Effect.runPromise(
      providerProgram(fake.auth, (provider) => provider.revoke(token))
    )

    expect(fake.revokedTokens).toEqual(['provider-token'])
  })

  test('classifies provider exceptions without retaining raw failure data', async () => {
    const fake = makeFakeBetterAuth({
      revokeSession: async () => {
        throw new Error('provider-secret-diagnostic')
      },
    })
    const token = S.decodeUnknownSync(SessionToken)('provider-token')
    const error = await Effect.runPromise(
      Effect.flip(
        providerProgram(fake.auth, (provider) => provider.revoke(token))
      )
    )

    expect(error).toBeInstanceOf(SessionProviderUnavailable)

    if (error instanceof SessionProviderUnavailable) {
      expect(error.status).toBe(502)
    }

    expect(Object.keys(error)).not.toContain('cause')
    expect(Object.keys(error)).not.toContain('headers')
    expect(JSON.stringify(error)).not.toContain('provider-secret-diagnostic')
    expect(JSON.stringify(error)).not.toContain('provider-token')
  })

  test('rejects an unsuccessful revoke status', async () => {
    const failed = makeFakeBetterAuth({
      revokeSession: async () => ({ status: false }),
    })
    const token = S.decodeUnknownSync(SessionToken)('provider-token')
    const error = await Effect.runPromise(
      Effect.flip(
        providerProgram(failed.auth, (provider) => provider.revoke(token))
      )
    )

    expect(error).toBeInstanceOf(InvalidSessionProviderResponse)

    if (error instanceof InvalidSessionProviderResponse) {
      expect(error.reason).toBe('unsuccessful-status')
    }
  })

  test('does not call Better Auth when cancellation is already requested', async () => {
    const fake = makeFakeBetterAuth()
    const controller = new AbortController()
    controller.abort('private-reason')

    const error = await Effect.runPromise(
      Effect.flip(
        providerProgram(fake.auth, (provider) =>
          provider.listOwned(ownerId, { signal: controller.signal })
        )
      )
    )

    expect(error).toBeInstanceOf(SessionProviderCancelled)
    expect(error.operation).toBe('listSessions')
    expect(JSON.stringify(error)).not.toContain('private-reason')
    expect(fake.listSessionsCount()).toBe(0)
  })

  test('checks cancellation after Better Auth returns a read', async () => {
    const controller = new AbortController()
    const fake = makeFakeBetterAuth({
      listSessions: async () => {
        controller.abort()
        return [providerSession()]
      },
    })

    const error = await Effect.runPromise(
      Effect.flip(
        providerProgram(fake.auth, (provider) =>
          provider.listOwned(ownerId, { signal: controller.signal })
        )
      )
    )

    expect(error).toBeInstanceOf(SessionProviderCancelled)
    expect(error.operation).toBe('listSessions')
    expect(fake.listSessionsCount()).toBe(1)
  })

  test('reports cancellation after an idempotent provider mutation', async () => {
    const controller = new AbortController()
    const fake = makeFakeBetterAuth({
      revokeSession: async () => {
        controller.abort()
        return { status: true }
      },
    })
    const token = S.decodeUnknownSync(SessionToken)('provider-token')

    const error = await Effect.runPromise(
      Effect.flip(
        providerProgram(fake.auth, (provider) =>
          provider.revoke(token, { signal: controller.signal })
        )
      )
    )

    expect(error).toBeInstanceOf(SessionProviderCancelled)
    expect(error.operation).toBe('revokeSession')
    expect(fake.revokedTokens).toEqual(['provider-token'])
  })

  test('classifies an aborted provider failure as cancellation', async () => {
    const controller = new AbortController()
    const fake = makeFakeBetterAuth({
      listSessions: async () => {
        controller.abort('private-provider-reason')
        throw new Error('private-provider-failure')
      },
    })

    const error = await Effect.runPromise(
      Effect.flip(
        providerProgram(fake.auth, (provider) =>
          provider.listOwned(ownerId, { signal: controller.signal })
        )
      )
    )

    expect(error).toBeInstanceOf(SessionProviderCancelled)
    expect(error.operation).toBe('listSessions')
    expect(JSON.stringify(error)).not.toContain('private-provider')
  })
})
