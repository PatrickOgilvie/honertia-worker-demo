import { Effect, Schema as S } from 'effect'
import {
  action,
  render,
} from 'honertia/effect'


// Dashboard
export const showDashboard = action(
  Effect.gen(function* () {
    return yield* render('Dashboard')
  })
)