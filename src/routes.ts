import type { Hono } from 'hono'
import { showDashboard } from './actions/dashboard'
import { loginUser, registerUser, logoutUser } from './actions/auth'
import { effectRoutes, effectAuthRoutes, RequireAuthLayer } from '@popcomputer/web/effect'
import type { AppEnv } from './types'

/** Registers authentication endpoints and the protected dashboard route. */
export function registerRoutes(app: Hono<AppEnv>) {
  // Auth routes with unified config (pages + actions in one call)
  effectAuthRoutes(app, {
    loginComponent: 'Auth/Login',
    registerComponent: 'Auth/Register',
    loginAction: loginUser,
    registerAction: registerUser,
    logoutAction: logoutUser,
  })

  // Protected routes - dashboard
  effectRoutes(app)
    .provide(RequireAuthLayer)
    .group((route) => {
      route.get('/', showDashboard, { name: 'dashboard.show' })
    })
}
