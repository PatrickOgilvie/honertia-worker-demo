import type { Hono } from 'hono'
import { showDashboard } from './actions/dashboard'
import { loginUser, registerUser, logoutUser } from './actions/auth'
import {
  createProject,
  destroyProject,
  editProject,
  listProjectsApi,
  showProject,
  showProjects,
  showPublicProject,
  storeProject,
  updateProject,
} from './actions/projects'
import {
  RevokeSessionInput,
  revokeOtherSessions,
  revokeSession,
  showSessions,
} from './actions/sessions'
import {
  CreateProjectInput,
  ProjectParams,
  UpdateProjectInput,
} from './domain/project'
import { ProjectApiIndexResponse } from './presentation/project'
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

  // Anonymous project pages demonstrate Workers Cache headers and binding tags.
  effectRoutes(app).get(
    '/showcase/projects/{project}',
    showPublicProject,
    {
      name: 'projects.public',
      params: ProjectParams,
      cache: { maxAge: 60, staleWhileRevalidate: 300 },
    }
  )

  // Protected application routes.
  effectRoutes(app)
    .provide(RequireAuthLayer)
    .group((route) => {
      route.get('/', showDashboard, { name: 'dashboard.show' })
      route.get('/api/projects', listProjectsApi, {
        name: 'projects.list',
        response: ProjectApiIndexResponse,
      })
      route.get('/sessions', showSessions, { name: 'sessions.index' })
      route.post('/sessions/revoke', revokeSession, {
        name: 'sessions.revoke',
        body: RevokeSessionInput,
        validateBody: false,
      })
      route.post('/sessions/revoke-others', revokeOtherSessions, {
        name: 'sessions.destroy',
      })
      route.get('/projects', showProjects, { name: 'projects.index' })
      route.get('/projects/create', createProject, {
        name: 'projects.create',
      })
      route.post('/projects', storeProject, {
        name: 'projects.store',
        body: CreateProjectInput,
        validateBody: false,
        purges: ['projects'],
      })
      route.get('/projects/{project}', showProject, {
        name: 'projects.show',
        params: ProjectParams,
      })
      route.get('/projects/{project}/edit', editProject, {
        name: 'projects.edit',
        params: ProjectParams,
      })
      route.put('/projects/{project}', updateProject, {
        name: 'projects.update',
        params: ProjectParams,
        body: UpdateProjectInput,
        validateBody: false,
        purges: true,
      })
      route.delete('/projects/{project}', destroyProject, {
        name: 'projects.destroy',
        params: ProjectParams,
        purges: true,
      })
    })
}
