import { Effect, Schema as S } from 'effect'
import {
  DatabaseService,
  RequestService,
  AuthUserService,
  action,
  render,
  redirect,
  notFound,
  validateRequest,
  requiredString,
  nullableString,
} from 'honertia/effect'
import { and, eq } from 'drizzle-orm'
import { projects } from '~/db/schema'


// Dashboard
export const showDashboard = action(
  Effect.gen(function* () {
    return yield* render('Dashboard')
  })
)

// List projects
export const listProjects = action(
  Effect.gen(function* () {
    const { user } = yield* AuthUserService
    const db = yield* DatabaseService

    const userProjects = yield* Effect.tryPromise({
      try: () =>
        db.query.projects.findMany({
          where: eq(projects.userId, user.id),
          orderBy: (p, { desc }) => [desc(p.createdAt)],
        }),
      catch: (error) => new Error(String(error)),
    })

    return yield* render('Projects/Index', {
      projects: userProjects,
    })
  })
)

// Show single project
export const showProject = action(
  Effect.gen(function* () {
    const { user } = yield* AuthUserService
    const db = yield* DatabaseService
    const request = yield* RequestService

    const id = request.param('id') || ''

    const project = yield* Effect.tryPromise({
      try: () =>
        db.query.projects.findFirst({
          where: and(eq(projects.id, id), eq(projects.userId, user.id)),
        }),
      catch: (error) => new Error(String(error)),
    })

    if (!project) {
      return yield* notFound('Project')
    }

    return yield* render('Projects/Show', { project })
  })
)

// Show create form
export const showCreateProject = action(
  Effect.gen(function* () {
    return yield* render('Projects/Create')
  })
)

// Create project validation schema
const CreateProjectSchema = S.Struct({
  name: requiredString.pipe(S.minLength(3), S.maxLength(100)),
  description: nullableString,
})

// Create project
export const createProject = action(
  Effect.gen(function* () {
    const { user } = yield* AuthUserService
    const db = yield* DatabaseService

    const input = yield* validateRequest(CreateProjectSchema, {
      errorComponent: 'Projects/Create',
    })

    const now = new Date()

    yield* Effect.tryPromise({
      try: () =>
        db.insert(projects).values({
          ...input,
          id: crypto.randomUUID(),
          userId: user.id,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }),
      catch: (error) => new Error(String(error)),
    })

    return yield* redirect('/projects')
  })
)

// Delete project
export const deleteProject = action(
  Effect.gen(function* () {
    const { user } = yield* AuthUserService
    const db = yield* DatabaseService
    const request = yield* RequestService

    const id = request.param('id') || ''

    // Verify ownership and delete
    const project = yield* Effect.tryPromise({
      try: () =>
        db.query.projects.findFirst({
          where: and(eq(projects.id, id), eq(projects.userId, user.id)),
        }),
      catch: (error) => new Error(String(error)),
    })

    if (!project) {
      return yield* notFound('Project')
    }

    yield* Effect.tryPromise({
      try: () => db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, user.id))),
      catch: (error) => new Error(String(error)),
    })

    return yield* redirect('/projects')
  })
)
