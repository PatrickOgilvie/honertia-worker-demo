import type { Hono } from 'hono'
import { effectRoutes, effectAuthRoutes, RequireAuthLayer } from 'honertia'
import { loginUser, registerUser } from './actions/auth'
import {
  showDashboard,
  listProjects,
  showProject,
  showCreateProject,
  createProject,
  deleteProject,
} from './actions/projects'

export function registerRoutes(app: Hono<any>) {
  // Auth routes with unified config (pages + actions in one call)
  effectAuthRoutes(app, {
    loginComponent: 'Auth/Login',
    registerComponent: 'Auth/Register',
    loginAction: loginUser,
    registerAction: registerUser,
  })

  // Protected routes - dashboard and projects
  effectRoutes(app)
    .provide(RequireAuthLayer)
    .group((route) => {
      route.get('/', showDashboard)

      route.prefix('/projects').group((route) => {
        route.get('/', listProjects)
        route.get('/create', showCreateProject)
        route.post('/', createProject)
        route.get('/:id', showProject)
        route.delete('/:id', deleteProject)
      })
    })
}
