import { Effect, Option, Schema as S } from 'effect'

import {
  action,
  authorize,
  bound,
  HttpError,
  json,
  NotFoundError,
  prefersJson,
  redirect,
  render,
  renderWithErrors,
  RequestService,
} from '@popcomputer/web/effect'
import {
  DeleteProjectOutcome,
  type ProjectActor,
  ProjectDeleteConflict,
  ProjectIdConflict,
  ProjectLifetimeLimitReached,
  type ProjectMutationCancelled,
  ProjectNotFound,
  ProjectUpdateConflict,
  type ProjectReadCancelled,
  type ProjectReadFailure,
  Projects,
} from '~/application/projects'
import {
  CreateProjectInput,
  DeleteProjectInput,
  ProjectParams,
  UpdateProjectInput,
} from '~/domain/project'
import {
  defineStrictForm,
  respondWithStrictFormErrors,
} from '~/http/strict-form-route'
import {
  ProjectApiIndexResponse,
  toProjectDetail,
  toProjectSummary,
  toPublicProject,
} from '~/presentation/project'

type ProjectActionFailure =
  | ProjectIdConflict
  | ProjectLifetimeLimitReached
  | ProjectDeleteConflict
  | ProjectMutationCancelled
  | ProjectNotFound
  | ProjectUpdateConflict
  | ProjectReadCancelled
  | ProjectReadFailure

function toProjectActionFailure(
  failure: ProjectActionFailure
): HttpError | NotFoundError {
  switch (failure._tag) {
    case 'ProjectNotFound':
      return NotFoundError.forResource('Project', failure.projectId)
    case 'ProjectIdConflict':
      return new HttpError({
        status: 409,
        message:
          'That project identifier is already in use. Reload the form and try again.',
      })
    case 'ProjectLifetimeLimitReached':
      return new HttpError({
        status: 409,
        message: `This account has reached its lifetime limit of ${failure.limit} project identifiers.`,
      })
    case 'ProjectUpdateConflict':
      return new HttpError({
        status: 409,
        message:
          'This project changed after the edit form was opened. Reload it before saving again.',
      })
    case 'ProjectDeleteConflict':
      return new HttpError({
        status: 409,
        message:
          'This project changed after the page was opened. Reload it before deleting.',
      })
    case 'ProjectStoreUnavailable':
      return new HttpError({
        status: 503,
        message: 'Project data is temporarily unavailable.',
        body: { operation: failure.operation },
      })
    case 'InvalidStoredProject':
    case 'UnexpectedProjectStoreResult':
      return new HttpError({
        status: 500,
        message: 'Stored project data is invalid.',
      })
    case 'ProjectReadCancelled':
      return new HttpError({
        status: 408,
        message: 'The project request was cancelled before it completed.',
        body: { operation: failure.operation },
      })
    case 'ProjectMutationCancelled':
      return new HttpError({
        status: 408,
        message: failure.mutationCommitted
          ? 'The project change was saved before the request was cancelled. Reload before making another change.'
          : 'The project request was cancelled before a change was saved.',
        body: {
          operation: failure.operation,
          mutationCommitted: failure.mutationCommitted,
        },
      })
  }
}

const currentProjectActor = authorize().pipe(
  Effect.map(
    (auth): ProjectActor => ({
      userId: auth.user.id,
    })
  )
)

const projectIdFromRequest = Effect.gen(function* () {
  const request = yield* RequestService
  const rawProjectId = request.param('project')

  return yield* S.decodeUnknownEffect(ProjectParams)({
    project: rawProjectId,
  }).pipe(
    Effect.map((params) => params.project),
    Effect.mapError(() =>
      NotFoundError.forResource('Project', rawProjectId)
    )
  )
})

const getOwnedProject = Effect.fn('Projects.httpGetOwned')(function* () {
  const actor = yield* currentProjectActor
  const projectId = yield* projectIdFromRequest
  const projects = yield* Projects
  const owned = yield* projects
    .getOwned(actor, projectId)
    .pipe(Effect.mapError(toProjectActionFailure))

  return { actor, project: owned.project }
})()

/** Renders every project owned by the authenticated user. */
export const showProjects = action(
  Effect.fn('Projects.index')(function* () {
    const actor = yield* currentProjectActor
    const projects = yield* Projects
    const owned = yield* projects
      .listOwned(actor)
      .pipe(Effect.mapError(toProjectActionFailure))

    return yield* render('Projects/Index', {
      projects: owned.map(({ project }) => toProjectSummary(project)),
    })
  })()
)

/** Returns an authenticated, runtime-validated JSON project collection. */
export const listProjectsApi = action(
  Effect.fn('Projects.apiList')(function* () {
    const actor = yield* currentProjectActor
    const projects = yield* Projects
    const owned = yield* projects
      .listOwned(actor)
      .pipe(Effect.mapError(toProjectActionFailure))
    const payload = yield* S.decodeUnknownEffect(ProjectApiIndexResponse, {
      onExcessProperty: 'error',
    })({
      projects: owned.map(({ project }) => toProjectDetail(project)),
    }).pipe(
      Effect.mapError(
        () =>
          new HttpError({
            status: 500,
            message: 'The project API response is invalid.',
          })
      )
    )

    return yield* json(payload)
  })()
)

/** Renders the create-project form. */
export const createProject = action(
  Effect.fn('Projects.createForm')(function* () {
    yield* currentProjectActor
    return yield* render('Projects/Create')
  })()
)

/** Strict, retry-safe create-project form contract. */
export const storeProject = defineStrictForm({
  name: 'Projects.store',
  schema: CreateProjectInput,
  prepare: currentProjectActor,
  onInvalid: (errors) =>
    respondWithStrictFormErrors('Projects/Create', errors),
  onValid: (input, actor) =>
    Effect.gen(function* () {
      const projects = yield* Projects
      const outcome = yield* projects
        .create(actor, input)
        .pipe(Effect.mapError(toProjectActionFailure))

      return yield* redirect(`/projects/${outcome.project.project.id}`)
    }),
})

/** Renders one project found through an owner-scoped service lookup. */
export const showProject = action(
  Effect.fn('Projects.show')(function* () {
    const { project } = yield* getOwnedProject

    return yield* render('Projects/Show', {
      project: toProjectDetail(project),
    })
  })()
)

/** Renders the edit form for one project found through an owner-scoped lookup. */
export const editProject = action(
  Effect.fn('Projects.edit')(function* () {
    const { project } = yield* getOwnedProject

    return yield* render('Projects/Edit', {
      project: toProjectDetail(project),
    })
  })()
)

/** Strict update form whose owned project is loaded before its body is read. */
export const updateProject = defineStrictForm({
  name: 'Projects.update',
  schema: UpdateProjectInput,
  prepare: getOwnedProject,
  onInvalid: (errors, prepared) =>
    respondWithStrictFormErrors('Projects/Edit', errors, {
      project: toProjectDetail(prepared.project),
    }),
  onValid: (input, prepared) =>
    Effect.gen(function* () {
      const projects = yield* Projects
      const updated = yield* projects
        .update(prepared.actor, prepared.project.id, input)
        .pipe(
          Effect.map(Option.some),
          Effect.catchTag('ProjectUpdateConflict', () =>
            Effect.succeed(Option.none())
          ),
          Effect.mapError(toProjectActionFailure)
        )

      if (Option.isNone(updated)) {
        if (yield* prefersJson) {
          return yield* toProjectActionFailure(
            new ProjectUpdateConflict({
              projectId: prepared.project.id,
            })
          )
        }

        const current = yield* projects
          .getOwned(prepared.actor, prepared.project.id)
          .pipe(Effect.mapError(toProjectActionFailure))

        return yield* renderWithErrors(
          'Projects/Edit',
          {
            expectedRevision:
              'This project changed while you were editing it. Reload the latest version before saving again.',
          },
          { project: toProjectDetail(current.project) }
        )
      }

      return yield* redirect(`/projects/${updated.value.project.id}`)
    }),
})

/** Strict deletion form whose owner and revision are checked before retirement. */
export const destroyProject = defineStrictForm({
  name: 'Projects.destroy',
  schema: DeleteProjectInput,
  prepare: getOwnedProject,
  onInvalid: (errors, prepared) =>
    respondWithStrictFormErrors('Projects/Show', errors, {
      project: toProjectDetail(prepared.project),
    }),
  onValid: (input, prepared) =>
    Effect.gen(function* () {
      const projects = yield* Projects
      const outcome = yield* projects
        .remove(
          prepared.actor,
          prepared.project.id,
          input.expectedRevision
        )
        .pipe(
          Effect.map(Option.some),
          Effect.catchTag('ProjectDeleteConflict', () =>
            Effect.succeed(Option.none())
          ),
          Effect.mapError(toProjectActionFailure)
        )

      if (Option.isNone(outcome)) {
        if (yield* prefersJson) {
          return yield* toProjectActionFailure(
            new ProjectDeleteConflict({
              projectId: prepared.project.id,
            })
          )
        }

        const current = yield* projects
          .getOwned(prepared.actor, prepared.project.id)
          .pipe(Effect.mapError(toProjectActionFailure))

        return yield* renderWithErrors(
          'Projects/Show',
          {
            expectedRevision:
              'This project changed while this page was open. Review the latest details, then confirm again.',
          },
          { project: toProjectDetail(current.project) }
        )
      }

      if (DeleteProjectOutcome.$is('AlreadyAbsent')(outcome.value)) {
        return yield* NotFoundError.forResource(
          'Project',
          prepared.project.id
        )
      }

      return yield* redirect('/projects')
    }),
})

const boundProject = bound('project').pipe(
  Effect.catchTag(
    'BoundModelNotFound',
    () =>
      new HttpError({
        status: 500,
        message: 'The public project route binding was not available.',
      })
  )
)

/** Renders an anonymous, explicitly non-cacheable view of a public project. */
export const showPublicProject = action(
  Effect.fn('Projects.publicShow')(function* () {
    const storedProject = yield* boundProject
    if (
      storedProject.deletedAt !== null ||
      storedProject.visibility !== 'public'
    ) {
      return yield* NotFoundError.forResource(
        'Project',
        storedProject.id
      )
    }

    return yield* render('Projects/Public', {
      project: toPublicProject({
        ...storedProject,
        deletedAt: null,
        visibility: 'public',
      }),
    })
  })()
)
