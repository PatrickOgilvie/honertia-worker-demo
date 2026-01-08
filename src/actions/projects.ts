import { Effect, Schema as S } from 'effect'
import {
  DatabaseService,
  dbMutation,
  asTrusted,
  action,
  authorize,
  bound,
  render,
  redirect,
  validateRequest,
  requiredString,
  nullableString,
} from 'honertia/effect'
import { eq } from 'drizzle-orm'
import { projects, type NewProject } from '~/db/schema'


// Dashboard
export const showDashboard = action(
  Effect.gen(function* () {
    return yield* render('Dashboard')
  })
)

// List projects
export const listProjects = action(
  Effect.gen(function* () {
    const auth = yield* authorize()
    const db = yield* DatabaseService

    const userProjects = yield* Effect.tryPromise({
      try: () =>
        db.query.projects.findMany({
          where: eq(projects.userId, auth.user.id),
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
    const project = yield* bound('project')
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
    const auth = yield* authorize()
    const db = yield* DatabaseService

    const input = yield* validateRequest(CreateProjectSchema, {
      errorComponent: 'Projects/Create',
    })

    const now = new Date()
    const values = asTrusted<NewProject>({
      ...input,
      id: crypto.randomUUID(),
      userId: auth.user.id,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })

    yield* dbMutation(db, async (db) => {
      await db.insert(projects).values(values)
    })

    return yield* redirect('/projects')
  })
)

// Delete project
export const deleteProject = action(
  Effect.gen(function* () {
    const project = yield* bound('project')
    yield* authorize((a) => a.user.id === project.userId)
    const db = yield* DatabaseService

    yield* dbMutation(db, async (db) => {
      await db.delete(projects).where(eq(projects.id, project.id))
    })

    return yield* redirect('/projects')
  })
)
