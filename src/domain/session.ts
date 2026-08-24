import { Effect, Schema as S } from 'effect'

import {
  RedactedSessionToken,
  SessionToken,
} from '~/domain/auth-credentials'
import { SessionId, UserId } from '~/domain/identity'

/** Maximum number of active Better Auth sessions retained for one user. */
export const MAX_ACTIVE_SESSIONS = 5

const AuthenticatedSession = S.Struct({
  user: S.Struct({
    id: UserId,
  }),
  session: S.Struct({
    id: SessionId,
    userId: UserId,
    token: RedactedSessionToken,
  }),
})

/** A parsed authenticated actor authorized to manage their own sessions. */
export const SessionActor = S.Struct({
  userId: UserId,
  currentSessionId: SessionId,
  currentToken: RedactedSessionToken,
})

/** A parsed authenticated actor authorized to manage their own sessions. */
export interface SessionActor extends S.Schema.Type<typeof SessionActor> {}

/** Safe reasons an authenticated framework value cannot become a session actor. */
export const InvalidSessionActorReason = S.Literals([
  'invalid-authenticated-session',
  'owner-mismatch',
])

/** Safe reasons an authenticated framework value cannot become a session actor. */
export type InvalidSessionActorReason = S.Schema.Type<
  typeof InvalidSessionActorReason
>

/** The authenticated framework value is invalid or internally inconsistent. */
export class InvalidSessionActor extends S.TaggedError<InvalidSessionActor>()(
  'InvalidSessionActor',
  {
    reason: InvalidSessionActorReason,
  }
) {}

/**
 * Parses an authenticated framework value and proves that its user owns the
 * current session. The input must already keep its session token redacted.
 */
export const parseSessionActor = Effect.fn('SessionActor.parse')(
  function* (input: unknown) {
    const authenticated = yield* S.decodeUnknownEffect(AuthenticatedSession)(
      input
    ).pipe(
      Effect.mapError(
        () =>
          new InvalidSessionActor({
            reason: 'invalid-authenticated-session',
          })
      )
    )

    if (authenticated.user.id !== authenticated.session.userId) {
      return yield* new InvalidSessionActor({ reason: 'owner-mismatch' })
    }

    return {
      userId: authenticated.user.id,
      currentSessionId: authenticated.session.id,
      currentToken: authenticated.session.token,
    } satisfies SessionActor
  }
)

/** A parsed active session returned by the session provider boundary. */
export const SessionRecord = S.Struct({
  id: SessionId,
  createdAt: S.Date,
  updatedAt: S.Date,
  userId: UserId,
  expiresAt: S.Date,
  token: SessionToken,
  ipAddress: S.optionalKey(S.NullOr(S.String)),
  userAgent: S.optionalKey(S.NullOr(S.String)),
})

/** A parsed active session returned by the session provider boundary. */
export interface SessionRecord extends S.Schema.Type<typeof SessionRecord> {}

/** The complete, explicitly bounded active-session collection for one user. */
export const ActiveSessionRecords = S.Array(SessionRecord).check(
  S.isMaxLength(MAX_ACTIVE_SESSIONS, {
    message: `Expected at most ${MAX_ACTIVE_SESSIONS} active sessions`,
  })
)

/** The complete, explicitly bounded active-session collection for one user. */
export type ActiveSessionRecords = S.Schema.Type<typeof ActiveSessionRecords>

/** Token-free session information returned by the lifecycle service. */
export const ManagedSession = S.Struct({
  id: SessionId,
  createdAt: S.Date,
  updatedAt: S.Date,
  expiresAt: S.Date,
  ipAddress: S.NullOr(S.String),
  userAgent: S.NullOr(S.String),
  isCurrent: S.Boolean,
})

/** Token-free session information returned by the lifecycle service. */
export interface ManagedSession extends S.Schema.Type<typeof ManagedSession> {}

/** Strict browser command that identifies a session without exposing its token. */
export const RevokeSessionInput = S.Struct({
  sessionId: SessionId,
}).annotate({ identifier: 'RevokeSessionInput' })

/** Parsed command for revoking one non-current session. */
export interface RevokeSessionInput
  extends S.Schema.Type<typeof RevokeSessionInput> {}

/** Removes provider authority and marks whether a session is current. */
export function toManagedSession(
  session: SessionRecord,
  currentSessionId: SessionId
): ManagedSession {
  return {
    id: session.id,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
    isCurrent: session.id === currentSessionId,
  }
}
