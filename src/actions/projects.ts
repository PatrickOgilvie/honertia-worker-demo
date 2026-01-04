import { Effect } from 'effect'
import {
  DatabaseService,
  AuthUserService,
  RequestService,
  render,
  redirect,
  notFound,
  validateRequest,
  requiredString,
  nullableString,
} from 'honertia'
import { Schema as S } from 'effect'
import { eq } from 'drizzle-orm'
import { projects } from '~/db/schema'
import type { Database } from '~/db/db'

// Dashboard
export const showDashboard = Effect.gen(function* () {
  const user = yield* AuthUserService
  return yield* render('Dashboard', {
    user: {
      name: user.user.name || user.user.email,
      email: user.user.email,
    },
  })
})

// List projects
export const listProjects = Effect.gen(function* () {
  const db = (yield* DatabaseService) as Database
  const user = yield* AuthUserService

  const userProjects = yield* Effect.tryPromise({
    try: () =>
      db.query.projects.findMany({
        where: eq(projects.userId, user.user.id),
        orderBy: (p, { desc }) => [desc(p.createdAt)],
      }),
    catch: (error) => new Error(String(error)),
  })

  return yield* render('Projects/Index', {
    projects: userProjects,
  })
})

// Show single project
export const showProject = Effect.gen(function* () {
  const db = (yield* DatabaseService) as Database
  const user = yield* AuthUserService
  const request = yield* RequestService

  const id = request.param('id') || ''

  const project = yield* Effect.tryPromise({
    try: () =>
      db.query.projects.findFirst({
        where: eq(projects.id, id),
      }),
    catch: (error) => new Error(String(error)),
  })

  if (!project || project.userId !== user.user.id) {
    return yield* notFound('Project')
  }

  return yield* render('Projects/Show', { project })
})

// Show create form
export const showCreateProject = Effect.gen(function* () {
  return yield* render('Projects/Create', {})
})

// Create project validation schema
const CreateProjectSchema = S.Struct({
  name: requiredString.pipe(S.minLength(3), S.maxLength(100)),
  description: nullableString,
})

// Create project
export const createProject = Effect.gen(function* () {
  const db = (yield* DatabaseService) as Database
  const user = yield* AuthUserService

  const input = yield* validateRequest(CreateProjectSchema, {
    errorComponent: 'Projects/Create',
  })

  const now = new Date()

  yield* Effect.tryPromise({
    try: () =>
      db.insert(projects).values({
        ...input,
        id: crypto.randomUUID(),
        userId: user.user.id,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      }),
    catch: (error) => new Error(String(error)),
  })

  return yield* redirect('/projects')
})

// Delete project
export const deleteProject = Effect.gen(function* () {
  const db = (yield* DatabaseService) as Database
  const user = yield* AuthUserService
  const request = yield* RequestService

  const id = request.param('id') || ''

  // Verify ownership
  const project = yield* Effect.tryPromise({
    try: () =>
      db.query.projects.findFirst({
        where: eq(projects.id, id),
      }),
    catch: (error) => new Error(String(error)),
  })

  if (!project || project.userId !== user.user.id) {
    return yield* notFound('Project')
  }

  yield* Effect.tryPromise({
    try: () => db.delete(projects).where(eq(projects.id, id)),
    catch: (error) => new Error(String(error)),
  })

  return yield* redirect('/projects')
})
