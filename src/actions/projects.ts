import { and, desc, eq } from 'drizzle-orm'
import { Effect, Result, Schema as S } from 'effect'

import {
  action,
  asTrusted,
  authorize,
  bound,
  DatabaseService,
  dbMutation,
  HttpError,
  httpError,
  json,
  notFound,
  redirect,
  render,
  renderWithErrors,
  validateRequest,
} from '@popcomputer/web/effect'
import { projects } from '~/db/schema'
import {
  CreateProjectInput,
  Project,
  UpdateProjectInput,
} from '~/domain/project'
import {
  ProjectApiIndexResponse,
  toProjectDetail,
  toProjectSummary,
} from '~/presentation/project'

const strictParsing = { onExcessProperty: 'error' } as const
const bodyOnlyRequest = {
  order: ['body'],
  onConflict: 'error',
} as const

const boundProject = bound('project').pipe(
  Effect.catchTag(
    'BoundModelNotFound',
    (cause) =>
      new HttpError({
        status: 500,
        message: 'The project route binding was not available.',
        cause,
      })
  )
)

function readProjects<A>(
  operation: string,
  run: () => PromiseLike<A>
): Effect.Effect<A, HttpError> {
  return Effect.tryPromise({
    try: () => Promise.resolve(run()),
    catch: (cause) =>
      new HttpError({
        status: 503,
        message: 'Project data is temporarily unavailable.',
        body: { operation },
        cause,
      }),
  })
}

function parseProjects(
  rows: unknown
): Effect.Effect<ReadonlyArray<Project>, HttpError> {
  return S.decodeUnknownEffect(S.Array(Project))(rows).pipe(
    Effect.mapError(
      (cause) =>
        new HttpError({
          status: 500,
          message: 'Stored project data is invalid.',
          cause,
        })
    )
  )
}

/** Renders every project owned by the authenticated user. */
export const showProjects = action(
  Effect.fn('Projects.index')(function* () {
    const auth = yield* authorize()
    const db = yield* DatabaseService
    const rows = yield* readProjects('Projects.index', () =>
      db
        .select()
        .from(projects)
        .where(eq(projects.userId, auth.user.id))
        .orderBy(desc(projects.updatedAt))
    )
    const ownedProjects = yield* parseProjects(rows)

    return yield* render('Projects/Index', {
      projects: ownedProjects.map(toProjectSummary),
    })
  })()
)

/** Returns an authenticated, runtime-validated JSON project collection. */
export const listProjectsApi = action(
  Effect.fn('Projects.apiList')(function* () {
    const auth = yield* authorize()
    const db = yield* DatabaseService
    const rows = yield* readProjects('Projects.apiList', () =>
      db
        .select()
        .from(projects)
        .where(eq(projects.userId, auth.user.id))
        .orderBy(desc(projects.updatedAt))
    )
    const ownedProjects = yield* parseProjects(rows)
    const payload = yield* S.decodeUnknownEffect(ProjectApiIndexResponse, {
      onExcessProperty: 'error',
    })({ projects: ownedProjects.map(toProjectDetail) }).pipe(
      Effect.mapError(
        (cause) =>
          new HttpError({
            status: 500,
            message: 'The project API response is invalid.',
            cause,
          })
      )
    )

    return yield* json(payload)
  })()
)

/** Renders the create-project form. */
export const createProject = action(
  Effect.fn('Projects.create')(function* () {
    yield* authorize()
    return yield* render('Projects/Create')
  })()
)

/** Persists one strictly parsed project creation command. */
export const storeProject = action(
  Effect.fn('Projects.store')(function* () {
    const auth = yield* authorize()
    const validation = yield* Effect.result(
      validateRequest(CreateProjectInput, {
        request: bodyOnlyRequest,
        parseOptions: strictParsing,
      })
    )

    if (Result.isFailure(validation)) {
      return yield* renderWithErrors(
        'Projects/Create',
        validation.failure.errors
      )
    }

    const input = validation.success
    const db = yield* DatabaseService
    const now = new Date()
    const values = asTrusted({
      id: input.id,
      userId: auth.user.id,
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      createdAt: now,
      updatedAt: now,
    })

    yield* dbMutation(db, values, (tx, scoped) =>
      tx
        .insert(projects)
        .values(scoped)
        .onConflictDoNothing({ target: projects.id })
    )

    const rows = yield* readProjects('Projects.store.confirm', () =>
      db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.id, input.id),
            eq(projects.userId, auth.user.id)
          )
        )
        .limit(1)
    )
    const stored = yield* parseProjects(rows)
    const project = stored[0]

    if (!project) {
      return yield* httpError(
        409,
        'That project identifier is already in use. Reload the form and try again.'
      )
    }

    return yield* redirect(`/projects/${project.id}`)
  })()
)

/** Renders one owned project resolved through route-model binding. */
export const showProject = action(
  Effect.fn('Projects.show')(function* () {
    const project = yield* boundProject
    yield* authorize((auth) => auth.user.id === project.userId)

    return yield* render('Projects/Show', {
      project: toProjectDetail(project),
    })
  })()
)

/** Renders the edit form for one owned route-bound project. */
export const editProject = action(
  Effect.fn('Projects.edit')(function* () {
    const project = yield* boundProject
    yield* authorize((auth) => auth.user.id === project.userId)

    return yield* render('Projects/Edit', {
      project: toProjectDetail(project),
    })
  })()
)

/** Applies a strictly parsed update to one owned project. */
export const updateProject = action(
  Effect.fn('Projects.update')(function* () {
    const project = yield* boundProject
    const auth = yield* authorize(
      (current) => current.user.id === project.userId
    )
    const validation = yield* Effect.result(
      validateRequest(UpdateProjectInput, {
        request: bodyOnlyRequest,
        parseOptions: strictParsing,
      })
    )

    if (Result.isFailure(validation)) {
      return yield* renderWithErrors(
        'Projects/Edit',
        validation.failure.errors,
        { project: toProjectDetail(project) }
      )
    }

    const input = validation.success
    const db = yield* DatabaseService
    const values = asTrusted({
      name: input.name,
      description: input.description,
      visibility: input.visibility,
      updatedAt: new Date(),
    })

    yield* dbMutation(db, values, (tx, scoped) =>
      tx
        .update(projects)
        .set(scoped)
        .where(
          and(
            eq(projects.id, project.id),
            eq(projects.userId, auth.user.id)
          )
        )
    )

    return yield* redirect(`/projects/${project.id}`)
  })()
)

/** Deletes one owned project. Repeating the command leaves the same final state. */
export const destroyProject = action(
  Effect.fn('Projects.destroy')(function* () {
    const project = yield* boundProject
    const auth = yield* authorize(
      (current) => current.user.id === project.userId
    )
    const db = yield* DatabaseService
    const deletion = asTrusted({
      id: project.id,
      userId: auth.user.id,
    })

    yield* dbMutation(db, deletion, (tx) =>
      tx
        .delete(projects)
        .where(
          and(
            eq(projects.id, project.id),
            eq(projects.userId, auth.user.id)
          )
        )
    )

    return yield* redirect('/projects')
  })()
)

/** Renders an anonymous cacheable view of a public project. */
export const showPublicProject = action(
  Effect.fn('Projects.publicShow')(function* () {
    const project = yield* boundProject
    if (project.visibility !== 'public') {
      return yield* notFound('Project', project.id)
    }

    return yield* render('Projects/Public', {
      project: toProjectDetail(project),
    })
  })()
)
