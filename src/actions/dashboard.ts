import { Effect } from 'effect'
import { action, render } from '@popcomputer/web/effect'


// Dashboard
export const showDashboard = action(
  Effect.gen(function* () {
    return yield* render('Dashboard')
  })
)
