import {
  effectifyBetterAuth,
  type BetterAuthBoundaryFailure,
} from '@popcomputer/web/auth'
import { AuthService, RequestService } from '@popcomputer/web/effect'
import { Effect, Layer, Redacted, Schema as S } from 'effect'

import {
  InvalidSessionProviderResponse,
  SessionAuthenticationExpired,
  SessionLifecycleLayer,
  SessionProvider,
  SessionProviderCancelled,
  type SessionProviderApi,
  type SessionProviderFailure,
  type SessionProviderOperation,
  SessionProviderRateLimited,
  SessionProviderRejected,
  SessionProviderUnavailable,
  SessionReauthenticationRequired,
} from '~/application/session-lifecycle'
import type { SessionToken } from '~/domain/auth-credentials'
import type { UserId } from '~/domain/identity'
import { ActiveSessionRecords, type SessionRecord } from '~/domain/session'
import {
  type CancellableOptions,
  ensureRequestActive,
} from '~/runtime/request-cancellation'

/** Minimal Better Auth server capability used by the sessions adapter. */
export interface BetterAuthSessionServer {
  readonly api: {
    readonly listSessions: (input: {
      readonly headers: Headers
    }) => Promise<unknown>
    readonly revokeSession: (input: {
      readonly body: { readonly token: string }
      readonly headers: Headers
    }) => Promise<unknown>
  }
  readonly handler: (request: Request) => Response | Promise<Response>
}

const ProviderSuccess = S.Struct({
  status: S.Boolean,
})

function compareNewestSessionFirst(
  left: SessionRecord,
  right: SessionRecord
): number {
  const createdAtDifference =
    right.createdAt.getTime() - left.createdAt.getTime()

  return createdAtDifference === 0
    ? String(right.id).localeCompare(String(left.id))
    : createdAtDifference
}

function toSessionProviderFailure(
  operation: SessionProviderOperation,
  failure: BetterAuthBoundaryFailure
): SessionProviderFailure {
  switch (failure._tag) {
    case 'BetterAuthRedirected':
      return new SessionProviderRejected({
        operation,
        status: failure.status,
      })
    case 'BetterAuthRateLimited':
      return new SessionProviderRateLimited({
        operation,
        retryAfterSeconds: failure.retryAfterSeconds,
      })
    case 'BetterAuthRequestRejected': {
      const status = failure.error.status ?? 400

      if (status === 401) {
        return new SessionAuthenticationExpired({ operation })
      }

      if (status === 403) {
        return new SessionReauthenticationRequired({ operation })
      }

      return new SessionProviderRejected({ operation, status })
    }
    case 'BetterAuthServiceFailed':
      return new SessionProviderUnavailable({
        operation,
        status: failure.status,
      })
  }
}

const parseProviderSuccess = Effect.fn(
  'BetterAuthSessions.parseProviderSuccess'
)(function* (operation: SessionProviderOperation, input: unknown) {
  const response = yield* S.decodeUnknownEffect(ProviderSuccess)(input).pipe(
    Effect.mapError(
      () =>
        new InvalidSessionProviderResponse({
          operation,
          reason: 'invalid-payload',
        })
    )
  )

  if (!response.status) {
    return yield* new InvalidSessionProviderResponse({
      operation,
      reason: 'unsuccessful-status',
    })
  }
})

function makeSessionProvider(
  auth: BetterAuthSessionServer,
  headers: Headers
): SessionProviderApi {
  const authEffect = effectifyBetterAuth(auth)

  const ensureProviderActive = (
    operation: SessionProviderOperation,
    options: CancellableOptions
  ) =>
    ensureRequestActive(
      options,
      () => new SessionProviderCancelled({ operation })
    )

  const runProvider = <A>(
    operation: SessionProviderOperation,
    options: CancellableOptions,
    request: Effect.Effect<A, BetterAuthBoundaryFailure>
  ): Effect.Effect<A, SessionProviderFailure> =>
    Effect.gen(function* () {
      yield* ensureProviderActive(operation, options)
      const result = yield* request.pipe(
        Effect.catch((failure) =>
          ensureProviderActive(operation, options).pipe(
            Effect.andThen(
              Effect.fail(toSessionProviderFailure(operation, failure))
            )
          )
        )
      )
      yield* ensureProviderActive(operation, options)
      return result
    })

  const listOwned = Effect.fn('BetterAuthSessions.listOwned')(function* (
    ownerId: UserId,
    options: CancellableOptions = {}
  ) {
    const result = yield* runProvider(
      'listSessions',
      options,
      authEffect.api.listSessions({ headers })
    )
    const sessions = yield* S.decodeUnknownEffect(ActiveSessionRecords)(
      result
    ).pipe(
      Effect.mapError(
        () =>
          new InvalidSessionProviderResponse({
            operation: 'listSessions',
            reason: 'invalid-payload',
          })
      )
    )

    for (const session of sessions) {
      if (session.userId !== ownerId) {
        return yield* new InvalidSessionProviderResponse({
          operation: 'listSessions',
          reason: 'owner-mismatch',
        })
      }
    }

    return [...sessions].sort(compareNewestSessionFirst)
  })

  const revoke = Effect.fn('BetterAuthSessions.revoke')(function* (
    token: SessionToken,
    options: CancellableOptions = {}
  ) {
    const result = yield* runProvider(
      'revokeSession',
      options,
      authEffect.api.revokeSession({
        body: { token: Redacted.value(token) },
        headers,
      })
    )

    yield* parseProviderSuccess('revokeSession', result)
  })

  return SessionProvider.of({
    listOwned,
    revoke,
  })
}

/**
 * Creates a request-scoped provider Layer from a Better Auth server and the
 * request headers carrying its authenticated session.
 */
export function makeBetterAuthSessionsLayer(
  auth: BetterAuthSessionServer,
  headers: Headers
) {
  return Layer.succeed(SessionProvider, makeSessionProvider(auth, headers))
}

/** Request-scoped Better Auth implementation of the session provider port. */
export const BetterAuthSessionsLayer = Layer.effect(
  SessionProvider,
  Effect.gen(function* () {
    const auth = yield* AuthService
    const request = yield* RequestService

    return makeSessionProvider(auth, request.headers)
  })
)

/**
 * Complete session lifecycle Layer for handlers that already receive the
 * framework's request-scoped AuthService and RequestService.
 */
export const BetterAuthSessionLifecycleLayer = SessionLifecycleLayer.pipe(
  Layer.provide(BetterAuthSessionsLayer)
)
