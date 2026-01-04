import type { Hono } from 'hono'
import {
  effectRoutes,
  effectAuthRoutes,
  RequireAuthLayer,
  RequireGuestLayer,
} from 'honertia'
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
  // Auth routes (login, register, logout)
  effectAuthRoutes(app, {
    loginComponent: 'Auth/Login',
    registerComponent: 'Auth/Register',
    logoutRedirect: '/login',
  })

  // Auth form actions (guest only)
  effectRoutes(app)
    .provide(RequireGuestLayer)
    .group((route) => {
      route.post('/login', loginUser)
      route.post('/register', registerUser)
    })

  // Protected routes - dashboard
  effectRoutes(app)
    .provide(RequireAuthLayer)
    .group((route) => {
      route.get('/', showDashboard)
    })

  // Protected routes - projects
  effectRoutes(app)
    .provide(RequireAuthLayer)
    .prefix('/projects')
    .group((route) => {
      route.get('/', listProjects)
      route.get('/create', showCreateProject)
      route.post('/', createProject)
      route.get('/:id', showProject)
      route.delete('/:id', deleteProject)
    })
}
