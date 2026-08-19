import { Effect, Redacted, Result, Schema as S } from 'effect'

import {
  effectifyBetterAuth,
  type BetterAuthBoundaryFailure,
} from '@popcomputer/web/auth'
import {
  action,
  AuthRateLimitError,
  AuthRedirect,
  AuthService,
  AuthUserService,
  HttpError,
  redirect,
  render,
  renderWithErrors,
  RequestService,
  validateRequest,
} from '@popcomputer/web/effect'
import { requiredString } from '@popcomputer/web/schema'

const strictParsing = { onExcessProperty: 'error' } as const
const bodyOnlyRequest = {
  order: ['body'],
  onConflict: 'error',
} as const

/** Strict command used to identify a session without sending its secret token. */
export const RevokeSessionInput = S.Struct({
  sessionId: S.String.check(
    S.isMinLength(1, { message: 'This field is required' }),
    S.isMaxLength(128, { message: 'That session identifier is invalid.' })
  ).pipe(S.decodeTo(requiredString)),
}).annotate({ identifier: 'RevokeSessionInput' })

const ActiveSession = S.Struct({
  id: S.String,
  createdAt: S.Date,
  updatedAt: S.Date,
  userId: S.String,
  expiresAt: S.Date,
  token: S.RedactedFromValue(S.String),
  ipAddress: S.optionalKey(S.NullOr(S.String)),
  userAgent: S.optionalKey(S.NullOr(S.String)),
})

interface ActiveSession extends S.Schema.Type<typeof ActiveSession> {}

/** Non-secret session information exposed to the browser. */
export type SessionSummary = {
  readonly id: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly expiresAt: string
  readonly ipAddress: string | null
  readonly userAgent: string | null
  readonly isCurrent: boolean
}

type SessionManagementFailure =
  | AuthRateLimitError
  | AuthRedirect
  | HttpError

function toSessionManagementFailure(
  failure: BetterAuthBoundaryFailure
): SessionManagementFailure {
  switch (failure._tag) {
    case 'BetterAuthRedirected':
      return new AuthRedirect({
        status: failure.status,
        headers: new Headers(failure.headers),
      })
    case 'BetterAuthRateLimited':
      return new AuthRateLimitError({
        retryAfterSeconds: failure.retryAfterSeconds,
        cause: failure.cause,
        headers: new Headers(failure.headers),
      })
    case 'BetterAuthRequestRejected': {
      const status = failure.error.status ?? 400
      const message =
        status === 401
          ? 'Your session is no longer active.'
          : status === 403
            ? 'Sign in again before changing active sessions.'
            : 'Unable to manage that session.'

      return new HttpError({
        status,
        message,
        cause: failure.error.cause,
        headers: new Headers(failure.headers),
      })
    }
    case 'BetterAuthServiceFailed':
      return new HttpError({
        status: failure.status,
        message: 'The authentication service is temporarily unavailable.',
        cause: failure.cause,
        headers: new Headers(failure.headers),
      })
  }
}

const parseActiveSessions = Effect.fn('Sessions.parseActiveSessions')(
  function* (input: unknown) {
    return yield* S.decodeUnknownEffect(S.Array(ActiveSession))(input).pipe(
      Effect.mapError(
        (cause) =>
          new HttpError({
            status: 502,
            message: 'The authentication service returned invalid session data.',
            cause,
          })
      )
    )
  }
)

function toSessionSummary(
  session: ActiveSession,
  currentSessionId: string
): SessionSummary {
  return {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    ipAddress: session.ipAddress ?? null,
    userAgent: session.userAgent ?? null,
    isCurrent: session.id === currentSessionId,
  }
}

/** Lists the signed-in user's active sessions without exposing session tokens. */
export const showSessions = action(
  Effect.fn('Sessions.index')(function* () {
    const auth = yield* AuthService
    const authUser = yield* AuthUserService
    const request = yield* RequestService
    const authEffect = effectifyBetterAuth(auth)
    const result = yield* authEffect.api.listSessions({
      headers: request.headers,
    }).pipe(Effect.mapError(toSessionManagementFailure))
    const sessions = yield* parseActiveSessions(result)

    return yield* render('Sessions/Index', {
      sessions: sessions.map((session) =>
        toSessionSummary(session, authUser.session.id)
      ),
    })
  })()
)

/** Revokes one owned session after resolving its secret token on the server. */
export const revokeSession = action(
  Effect.fn('Sessions.revoke')(function* () {
    const validation = yield* Effect.result(
      validateRequest(RevokeSessionInput, {
        request: bodyOnlyRequest,
        parseOptions: strictParsing,
      })
    )
    const auth = yield* AuthService
    const authUser = yield* AuthUserService
    const request = yield* RequestService
    const authEffect = effectifyBetterAuth(auth)
    const result = yield* authEffect.api.listSessions({
      headers: request.headers,
    }).pipe(Effect.mapError(toSessionManagementFailure))
    const sessions = yield* parseActiveSessions(result)
    const summaries = sessions.map((session) =>
      toSessionSummary(session, authUser.session.id)
    )

    if (Result.isFailure(validation)) {
      return yield* renderWithErrors(
        'Sessions/Index',
        validation.failure.errors,
        { sessions: summaries }
      )
    }

    const input = validation.success
    const target = sessions.find((session) => session.id === input.sessionId)

    if (target === undefined) {
      return yield* renderWithErrors(
        'Sessions/Index',
        { sessionId: 'That session is no longer active.' },
        { sessions: summaries }
      )
    }

    if (target.id === authUser.session.id) {
      return yield* renderWithErrors(
        'Sessions/Index',
        { sessionId: 'Use sign out to end this session.' },
        { sessions: summaries }
      )
    }

    yield* authEffect.api.revokeSession({
      body: { token: Redacted.value(target.token) },
      headers: request.headers,
    }).pipe(Effect.mapError(toSessionManagementFailure))

    return yield* redirect('/sessions')
  })()
)

/** Revokes every active session except the request's current session. */
export const revokeOtherSessions = action(
  Effect.fn('Sessions.revokeOthers')(function* () {
    const auth = yield* AuthService
    const request = yield* RequestService
    const authEffect = effectifyBetterAuth(auth)

    yield* authEffect.api.revokeOtherSessions({
      headers: request.headers,
    }).pipe(Effect.mapError(toSessionManagementFailure))

    return yield* redirect('/sessions')
  })()
)
