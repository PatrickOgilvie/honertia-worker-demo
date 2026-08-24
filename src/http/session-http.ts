import { Effect } from 'effect'

import {
  AuthRateLimitError,
  AuthUserService,
  HttpError,
  UnauthorizedError,
} from '@popcomputer/web/effect'
import {
  InvalidSessionProviderResponse,
  SessionAuthenticationExpired,
  type SessionLifecycleFailure,
  SessionLifecycleCancelled,
  SessionProviderRateLimited,
  SessionProviderRejected,
  SessionProviderUnavailable,
  SessionReauthenticationRequired,
} from '~/application/session-lifecycle'
import {
  InvalidSessionActor,
  parseSessionActor,
} from '~/domain/session'

type SessionHttpFailure = InvalidSessionActor | SessionLifecycleFailure

/** Converts safe local session failures into the framework's HTTP vocabulary. */
export function toSessionHttpFailure(
  failure: SessionHttpFailure
): AuthRateLimitError | HttpError | UnauthorizedError {
  switch (failure._tag) {
    case 'InvalidSessionActor':
      return new HttpError({
        status: 500,
        message: 'The authenticated session is internally inconsistent.',
      })
    case 'InvalidSessionProviderResponse':
      return new HttpError({
        status: 502,
        message: 'The authentication service returned invalid session data.',
      })
    case 'SessionAuthenticationExpired':
      return UnauthorizedError.sessionExpired('/login')
    case 'SessionReauthenticationRequired':
      return new HttpError({
        status: 403,
        message: 'Sign in again before changing active sessions.',
      })
    case 'SessionProviderRateLimited':
      return new AuthRateLimitError({
        retryAfterSeconds: failure.retryAfterSeconds,
        cause: 'better-auth-session-rate-limited',
      })
    case 'SessionProviderRejected':
      return new HttpError({
        status: failure.status,
        message: 'The authentication service rejected the session operation.',
      })
    case 'SessionProviderUnavailable':
      return new HttpError({
        status: failure.status,
        message: 'The authentication service is temporarily unavailable.',
      })
    case 'SessionLifecycleCancelled':
      return new HttpError({
        status: 408,
        message: 'The session request was cancelled before it completed.',
        body: { operation: failure.operation },
      })
  }
}

/** Parses the already authenticated framework value into a local actor. */
export const currentSessionActor = Effect.gen(function* () {
  const authUser = yield* AuthUserService
  return yield* parseSessionActor(authUser).pipe(
    Effect.mapError(toSessionHttpFailure)
  )
})
