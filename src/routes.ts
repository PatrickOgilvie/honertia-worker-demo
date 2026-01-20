import type { Hono } from 'hono'
import { showDashboard } from './actions/dashboard'
import { loginUser, registerUser, logoutUser } from './actions/auth'
import { effectRoutes, effectAuthRoutes, RequireAuthLayer } from 'honertia'

export function registerRoutes(app: Hono<any>) {
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
      route.get('/', showDashboard)
    })
}
