import { Context, Effect, Layer, Schema as S } from 'effect'

import type { SessionToken } from '~/domain/auth-credentials'
import { SessionId, type UserId } from '~/domain/identity'
import {
  type ManagedSession,
  type SessionActor,
  type SessionRecord,
  toManagedSession,
} from '~/domain/session'
import {
  type CancellableOptions,
  ensureRequestActive,
} from '~/runtime/request-cancellation'

/** Better Auth operations exposed through the local provider boundary. */
export const SessionProviderOperation = S.Literals([
  'listSessions',
  'revokeSession',
])

/** Better Auth operations exposed through the local provider boundary. */
export type SessionProviderOperation = S.Schema.Type<
  typeof SessionProviderOperation
>

/** Application operations exposed by the session lifecycle. */
export const SessionLifecycleOperation = S.Literals([
  'list',
  'revokeOne',
  'revokeOthers',
  'endCurrent',
])

/** Application operations exposed by the session lifecycle. */
export type SessionLifecycleOperation = S.Schema.Type<
  typeof SessionLifecycleOperation
>

/** Safe reasons a provider response could not become a local session value. */
export const InvalidSessionProviderResponseReason = S.Literals([
  'invalid-payload',
  'owner-mismatch',
  'unsuccessful-status',
])

/** Safe reasons a provider response could not become a local session value. */
export type InvalidSessionProviderResponseReason = S.Schema.Type<
  typeof InvalidSessionProviderResponseReason
>

/** The authenticated Better Auth session is no longer active. */
export class SessionAuthenticationExpired extends S.TaggedError<SessionAuthenticationExpired>()(
  'SessionAuthenticationExpired',
  {
    operation: SessionProviderOperation,
  }
) {}

/** Better Auth requires a fresh login before changing active sessions. */
export class SessionReauthenticationRequired extends S.TaggedError<SessionReauthenticationRequired>()(
  'SessionReauthenticationRequired',
  {
    operation: SessionProviderOperation,
  }
) {}

/** Better Auth rate-limited a session-management operation. */
export class SessionProviderRateLimited extends S.TaggedError<SessionProviderRateLimited>()(
  'SessionProviderRateLimited',
  {
    operation: SessionProviderOperation,
    retryAfterSeconds: S.UndefinedOr(S.Number),
  }
) {}

/** Better Auth rejected a session-management operation. */
export class SessionProviderRejected extends S.TaggedError<SessionProviderRejected>()(
  'SessionProviderRejected',
  {
    operation: SessionProviderOperation,
    status: S.Number,
  }
) {}

/** Better Auth was unavailable while managing sessions. */
export class SessionProviderUnavailable extends S.TaggedError<SessionProviderUnavailable>()(
  'SessionProviderUnavailable',
  {
    operation: SessionProviderOperation,
    status: S.Number,
  }
) {}

/** Better Auth returned session data that violated the local contract. */
export class InvalidSessionProviderResponse extends S.TaggedError<InvalidSessionProviderResponse>()(
  'InvalidSessionProviderResponse',
  {
    operation: SessionProviderOperation,
    reason: InvalidSessionProviderResponseReason,
  }
) {}

/** A provider operation stopped at a request cancellation boundary. */
export class SessionProviderCancelled extends S.TaggedError<SessionProviderCancelled>()(
  'SessionProviderCancelled',
  {
    operation: SessionProviderOperation,
  }
) {}

/** A lifecycle operation stopped at a safe, retryable cancellation boundary. */
export class SessionLifecycleCancelled extends S.TaggedError<SessionLifecycleCancelled>()(
  'SessionLifecycleCancelled',
  {
    operation: SessionLifecycleOperation,
  }
) {}

/** Expected failures returned by the Better Auth sessions adapter. */
export type SessionProviderFailure =
  | InvalidSessionProviderResponse
  | SessionAuthenticationExpired
  | SessionProviderCancelled
  | SessionProviderRateLimited
  | SessionProviderRejected
  | SessionProviderUnavailable
  | SessionReauthenticationRequired

/** Behavior required from an authenticated session provider. */
export interface SessionProviderApi {
  /** Lists active sessions and proves that every returned session is owned. */
  readonly listOwned: (
    ownerId: UserId,
    options?: CancellableOptions
  ) => Effect.Effect<ReadonlyArray<SessionRecord>, SessionProviderFailure>

  /** Revokes one session by its still-redacted provider token. */
  readonly revoke: (
    token: SessionToken,
    options?: CancellableOptions
  ) => Effect.Effect<void, SessionProviderFailure>
}

/** Provider seam used by the application-owned session lifecycle. */
export class SessionProvider extends Context.Service<
  SessionProvider,
  SessionProviderApi
>()('@app/SessionProvider') {}

/** A session target cannot be revoked through the other-session operation. */
export class CannotRevokeCurrentSession extends S.TaggedError<CannotRevokeCurrentSession>()(
  'CannotRevokeCurrentSession',
  {
    sessionId: SessionId,
  }
) {}

/** Idempotent outcome of revoking one session. */
export const RevokeSessionOutcome = S.TaggedUnion({
  Revoked: {
    sessionId: SessionId,
  },
  AlreadyInactive: {
    sessionId: SessionId,
  },
})

/** Idempotent outcome of revoking one session. */
export type RevokeSessionOutcome = typeof RevokeSessionOutcome.Type

/** Expected failures returned by session lifecycle operations. */
export type SessionLifecycleFailure =
  | SessionLifecycleCancelled
  | Exclude<SessionProviderFailure, SessionProviderCancelled>

/** Application-owned session lifecycle operations. */
export interface SessionLifecycleApi {
  /** Lists token-free sessions owned by the authenticated actor. */
  readonly list: (
    actor: SessionActor,
    options?: CancellableOptions
  ) => Effect.Effect<ReadonlyArray<ManagedSession>, SessionLifecycleFailure>

  /** Revokes one non-current session, treating absence as idempotent success. */
  readonly revokeOne: (
    actor: SessionActor,
    target: SessionId,
    options?: CancellableOptions
  ) => Effect.Effect<
    RevokeSessionOutcome,
    CannotRevokeCurrentSession | SessionLifecycleFailure
  >

  /** Revokes every session except the authenticated actor's current session. */
  readonly revokeOthers: (
    actor: SessionActor,
    options?: CancellableOptions
  ) => Effect.Effect<void, SessionLifecycleFailure>

  /** Authoritatively ends the actor's current server session. */
  readonly endCurrent: (
    actor: SessionActor,
    options?: CancellableOptions
  ) => Effect.Effect<RevokeSessionOutcome, SessionLifecycleFailure>
}

/** Application-owned session lifecycle service. */
export class SessionLifecycle extends Context.Service<
  SessionLifecycle,
  SessionLifecycleApi
>()('@app/SessionLifecycle') {}

/** Live lifecycle policy backed by the provided session provider. */
export const SessionLifecycleLayer = Layer.effect(
  SessionLifecycle,
  Effect.gen(function* () {
    const provider = yield* SessionProvider

    const ensureLifecycleActive = (
      operation: SessionLifecycleOperation,
      options: CancellableOptions
    ) =>
      ensureRequestActive(
        options,
        () => new SessionLifecycleCancelled({ operation })
      )

    const mapProviderCancellation =
      (operation: SessionLifecycleOperation) =>
      (failure: SessionProviderFailure): SessionLifecycleFailure =>
        failure._tag === 'SessionProviderCancelled'
          ? new SessionLifecycleCancelled({ operation })
          : failure

    const list = Effect.fn('SessionLifecycle.list')(function* (
      actor: SessionActor,
      options: CancellableOptions = {}
    ) {
      yield* ensureLifecycleActive('list', options)
      const sessions = yield* provider.listOwned(actor.userId, options).pipe(
        Effect.mapError(mapProviderCancellation('list'))
      )
      yield* ensureLifecycleActive('list', options)

      return sessions.map((session) =>
        toManagedSession(session, actor.currentSessionId)
      )
    })

    const revokeOne = Effect.fn('SessionLifecycle.revokeOne')(function* (
      actor: SessionActor,
      target: SessionId,
      options: CancellableOptions = {}
    ) {
      yield* ensureLifecycleActive('revokeOne', options)
      if (target === actor.currentSessionId) {
        return yield* new CannotRevokeCurrentSession({ sessionId: target })
      }

      const sessions = yield* provider.listOwned(actor.userId, options).pipe(
        Effect.mapError(mapProviderCancellation('revokeOne'))
      )
      yield* ensureLifecycleActive('revokeOne', options)
      const targetSession = sessions.find((session) => session.id === target)

      if (targetSession === undefined) {
        return RevokeSessionOutcome.cases.AlreadyInactive.make({
          sessionId: target,
        })
      }

      yield* provider.revoke(targetSession.token, options).pipe(
        Effect.mapError(mapProviderCancellation('revokeOne'))
      )
      yield* ensureLifecycleActive('revokeOne', options)

      return RevokeSessionOutcome.cases.Revoked.make({ sessionId: target })
    })

    const revokeOthers = Effect.fn('SessionLifecycle.revokeOthers')(
      function* (
        actor: SessionActor,
        options: CancellableOptions = {}
      ) {
        yield* ensureLifecycleActive('revokeOthers', options)
        const sessions = yield* provider.listOwned(actor.userId, options).pipe(
          Effect.mapError(mapProviderCancellation('revokeOthers'))
        )
        yield* ensureLifecycleActive('revokeOthers', options)

        // Revocations are deliberately serialized to bound pressure on D1. A
        // retry lists the remaining sessions again, so completed revocations
        // are not repeated after a partial failure or cancellation.
        for (const session of sessions) {
          if (session.id === actor.currentSessionId) {
            continue
          }

          yield* ensureLifecycleActive('revokeOthers', options)
          yield* provider.revoke(session.token, options).pipe(
            Effect.mapError(mapProviderCancellation('revokeOthers'))
          )
          yield* ensureLifecycleActive('revokeOthers', options)
        }
      }
    )

    const endCurrent = Effect.fn('SessionLifecycle.endCurrent')(function* (
      actor: SessionActor,
      options: CancellableOptions = {}
    ) {
      yield* ensureLifecycleActive('endCurrent', options)
      const revoked = yield* provider.revoke(actor.currentToken, options).pipe(
        Effect.mapError(mapProviderCancellation('endCurrent')),
        Effect.as(true),
        Effect.catchTag('SessionAuthenticationExpired', () =>
          Effect.succeed(false)
        )
      )
      yield* ensureLifecycleActive('endCurrent', options)

      return revoked
        ? RevokeSessionOutcome.cases.Revoked.make({
            sessionId: actor.currentSessionId,
          })
        : RevokeSessionOutcome.cases.AlreadyInactive.make({
            sessionId: actor.currentSessionId,
          })
    })

    return SessionLifecycle.of({
      list,
      revokeOne,
      revokeOthers,
      endCurrent,
    })
  })
)
