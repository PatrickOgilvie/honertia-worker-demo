import { Effect, Result } from 'effect'

import {
  action,
  redirect,
  render,
} from '@popcomputer/web/effect'
import { SessionLifecycle } from '~/application/session-lifecycle'
import { RevokeSessionInput } from '~/domain/session'
import {
  currentSessionActor,
  toSessionHttpFailure,
} from '~/http/session-http'
import {
  defineStrictForm,
  respondWithStrictFormErrors,
} from '~/http/strict-form-route'
import { toSessionSummary } from '~/presentation/session'

const sessionIndexContext = Effect.fn('Sessions.httpIndexContext')(
  function* () {
    const actor = yield* currentSessionActor
    const lifecycle = yield* SessionLifecycle
    const sessions = yield* lifecycle
      .list(actor)
      .pipe(Effect.mapError(toSessionHttpFailure))

    return {
      actor,
      sessions: sessions.map(toSessionSummary),
    }
  }
)()

/** Lists the signed-in user's active sessions without exposing tokens. */
export const showSessions = action(
  Effect.fn('Sessions.index')(function* () {
    const context = yield* sessionIndexContext
    return yield* render('Sessions/Index', { sessions: context.sessions })
  })()
)

/** Strict revoke form whose safe session list is prepared before body parsing. */
export const revokeSession = defineStrictForm({
  name: 'Sessions.revoke',
  schema: RevokeSessionInput,
  prepare: sessionIndexContext,
  onInvalid: (errors, context) =>
    respondWithStrictFormErrors('Sessions/Index', errors, {
      sessions: context.sessions,
    }),
  onValid: (input, context) =>
    Effect.gen(function* () {
      const lifecycle = yield* SessionLifecycle
      const outcome = yield* Effect.result(
        lifecycle.revokeOne(context.actor, input.sessionId)
      )

      if (Result.isFailure(outcome)) {
        if (outcome.failure._tag === 'CannotRevokeCurrentSession') {
          return yield* respondWithStrictFormErrors(
            'Sessions/Index',
            { sessionId: 'Use sign out to end this session.' },
            { sessions: context.sessions }
          )
        }

        return yield* toSessionHttpFailure(outcome.failure)
      }

      return yield* redirect('/sessions')
    }),
})

/** Revokes every active session except the request's current session. */
export const revokeOtherSessions = action(
  Effect.fn('Sessions.revokeOthers')(function* () {
    const actor = yield* currentSessionActor
    const lifecycle = yield* SessionLifecycle
    yield* lifecycle
      .revokeOthers(actor)
      .pipe(Effect.mapError(toSessionHttpFailure))

    return yield* redirect('/sessions')
  })()
)
