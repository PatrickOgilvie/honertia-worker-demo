import {
  Context,
  Data,
  DateTime,
  Effect,
  Layer,
  Option,
  Schema as S,
} from 'effect'

import type { UserId } from '~/domain/identity'
import {
  type CreateProjectInput,
  type Project,
  ProjectId,
  PROJECT_LIFETIME_LIMIT,
  ProjectRevision,
  type UpdateProjectInput,
} from '~/domain/project'
import {
  type CancellableOptions,
  ensureRequestActive,
} from '~/runtime/request-cancellation'

const ProjectStoreOperation = S.Literals([
  'listOwned',
  'findOwned',
  'insert',
  'updateOwned',
  'deleteOwned',
])

const ProjectReadOperation = S.Literals(['listOwned', 'getOwned'])

const ProjectMutationOperation = S.Literals(['create', 'update', 'remove'])

const INITIAL_PROJECT_REVISION = S.decodeUnknownSync(ProjectRevision)(1)

/** The authenticated identity allowed to operate on private projects. */
export interface ProjectActor {
  readonly userId: UserId
}

/** A project returned by an owner-scoped application operation. */
export interface OwnedProject {
  readonly ownerId: UserId
  readonly project: Project
}

/** Persistence input for a retry-safe project creation. */
export interface NewStoredProject {
  readonly id: ProjectId
  readonly userId: UserId
  readonly name: CreateProjectInput['name']
  readonly description: CreateProjectInput['description']
  readonly visibility: CreateProjectInput['visibility']
  readonly revision: ProjectRevision
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly deletedAt: null
}

/** Persistence input for an atomic owner-scoped project update. */
export interface StoredProjectUpdate {
  readonly id: ProjectId
  readonly ownerId: UserId
  readonly name: UpdateProjectInput['name']
  readonly description: UpdateProjectInput['description']
  readonly visibility: UpdateProjectInput['visibility']
  readonly expectedRevision: ProjectRevision
  readonly revision: ProjectRevision
  readonly updatedAt: Date
}

/** Result of an insert guarded by the project identifier's unique constraint. */
export type ProjectInsertOutcome = Data.TaggedEnum<{
  Inserted: Record<never, never>
  Conflict: Record<never, never>
  LimitReached: Record<never, never>
}>

/** Constructors and exhaustive matching for project-insert outcomes. */
export const ProjectInsertOutcome = Data.taggedEnum<ProjectInsertOutcome>()

/** Result of an atomic owner-scoped project update. */
export type ProjectUpdateOutcome = Data.TaggedEnum<{
  Updated: Record<never, never>
  Conflict: Record<never, never>
}>

/** Constructors and exhaustive matching for project-update outcomes. */
export const ProjectUpdateOutcome = Data.taggedEnum<ProjectUpdateOutcome>()

/** Result of a retry-safe project creation. */
export type CreateProjectOutcome = Data.TaggedEnum<{
  Created: { readonly project: OwnedProject }
  Replayed: { readonly project: OwnedProject }
}>

/** Constructors and exhaustive matching for project-creation outcomes. */
export const CreateProjectOutcome = Data.taggedEnum<CreateProjectOutcome>()

/** Result of an idempotent owner-scoped project deletion. */
export type DeleteProjectOutcome = Data.TaggedEnum<{
  Deleted: Record<never, never>
  AlreadyAbsent: Record<never, never>
}>

/** Constructors and exhaustive matching for project-deletion outcomes. */
export const DeleteProjectOutcome = Data.taggedEnum<DeleteProjectOutcome>()

/** An owner-scoped project lookup did not find an accessible project. */
export class ProjectNotFound extends S.TaggedError<ProjectNotFound>()(
  'ProjectNotFound',
  { projectId: ProjectId }
) {}

/** A create identifier is already owned by a different user. */
export class ProjectIdConflict extends S.TaggedError<ProjectIdConflict>()(
  'ProjectIdConflict',
  { projectId: ProjectId }
) {}

/** The account has retained its maximum lifetime number of project identifiers. */
export class ProjectLifetimeLimitReached extends S.TaggedError<ProjectLifetimeLimitReached>()(
  'ProjectLifetimeLimitReached',
  { limit: S.Number }
) {}

/** An update was based on a project revision that is no longer current. */
export class ProjectUpdateConflict extends S.TaggedError<ProjectUpdateConflict>()(
  'ProjectUpdateConflict',
  { projectId: ProjectId }
) {}

/** A delete was based on a project revision that is no longer current. */
export class ProjectDeleteConflict extends S.TaggedError<ProjectDeleteConflict>()(
  'ProjectDeleteConflict',
  { projectId: ProjectId }
) {}

/** A D1 project-store operation could not complete. */
export class ProjectStoreUnavailable extends S.TaggedError<ProjectStoreUnavailable>()(
  'ProjectStoreUnavailable',
  {
    operation: ProjectStoreOperation,
  }
) {}

/** A row returned by project persistence did not satisfy the domain schema. */
export class InvalidStoredProject extends S.TaggedError<InvalidStoredProject>()(
  'InvalidStoredProject',
  {
    operation: ProjectStoreOperation,
    rowIndex: S.Number,
  }
) {}

/** A single-row project write returned an impossible number of rows. */
export class UnexpectedProjectStoreResult extends S.TaggedError<UnexpectedProjectStoreResult>()(
  'UnexpectedProjectStoreResult',
  {
    operation: ProjectStoreOperation,
    expectedMaximum: S.Number,
    actual: S.Number,
  }
) {}

/** An owner-scoped project read stopped at a request cancellation boundary. */
export class ProjectReadCancelled extends S.TaggedError<ProjectReadCancelled>()(
  'ProjectReadCancelled',
  {
    operation: ProjectReadOperation,
  }
) {}

/**
 * A project mutation stopped at a request cancellation boundary. The commit
 * flag tells a retrying caller whether this invocation changed persistence.
 */
export class ProjectMutationCancelled extends S.TaggedError<ProjectMutationCancelled>()(
  'ProjectMutationCancelled',
  {
    operation: ProjectMutationOperation,
    mutationCommitted: S.Boolean,
  }
) {}

/** Failures shared by owner-scoped project reads. */
export type ProjectReadFailure =
  | ProjectStoreUnavailable
  | InvalidStoredProject
  | UnexpectedProjectStoreResult

/** Failures shared by owner-scoped project writes. */
export type ProjectWriteFailure =
  ProjectReadFailure

/** Persistence capability consumed by the Projects application service. */
export interface ProjectStoreApi {
  readonly listOwned: (
    ownerId: UserId
  ) => Effect.Effect<ReadonlyArray<Project>, ProjectReadFailure>
  readonly findOwned: (
    ownerId: UserId,
    id: ProjectId
  ) => Effect.Effect<Option.Option<Project>, ProjectReadFailure>
  readonly insert: (
    project: NewStoredProject
  ) => Effect.Effect<ProjectInsertOutcome, ProjectReadFailure>
  readonly updateOwned: (
    update: StoredProjectUpdate
  ) => Effect.Effect<ProjectUpdateOutcome, ProjectReadFailure>
  readonly deleteOwned: (
    ownerId: UserId,
    id: ProjectId,
    expectedRevision: ProjectRevision,
    deletedAt: Date
  ) => Effect.Effect<DeleteProjectOutcome, ProjectReadFailure>
}

/** Effect service tag for owner-scoped project persistence. */
export class ProjectStore extends Context.Service<
  ProjectStore,
  ProjectStoreApi
>()('@app/ProjectStore') {}

/** Application-owned project workflows exposed to HTTP and other protocols. */
export interface ProjectsApi {
  readonly listOwned: (
    actor: ProjectActor,
    options?: CancellableOptions
  ) => Effect.Effect<
    ReadonlyArray<OwnedProject>,
    ProjectReadCancelled | ProjectReadFailure
  >
  readonly getOwned: (
    actor: ProjectActor,
    id: ProjectId,
    options?: CancellableOptions
  ) => Effect.Effect<
    OwnedProject,
    ProjectNotFound | ProjectReadCancelled | ProjectReadFailure
  >
  readonly create: (
    actor: ProjectActor,
    input: CreateProjectInput,
    options?: CancellableOptions
  ) => Effect.Effect<
    CreateProjectOutcome,
    | ProjectIdConflict
    | ProjectLifetimeLimitReached
    | ProjectMutationCancelled
    | ProjectWriteFailure
  >
  readonly update: (
    actor: ProjectActor,
    id: ProjectId,
    input: UpdateProjectInput,
    options?: CancellableOptions
  ) => Effect.Effect<
    OwnedProject,
    | ProjectMutationCancelled
    | ProjectNotFound
    | ProjectUpdateConflict
    | ProjectWriteFailure
  >
  readonly remove: (
    actor: ProjectActor,
    id: ProjectId,
    expectedRevision: ProjectRevision,
    options?: CancellableOptions
  ) => Effect.Effect<
    DeleteProjectOutcome,
    ProjectDeleteConflict | ProjectMutationCancelled | ProjectWriteFailure
  >
}

/** Effect service tag for application-owned project workflows. */
export class Projects extends Context.Service<Projects, ProjectsApi>()(
  '@app/Projects'
) {}

function owned(actor: ProjectActor, project: Project): OwnedProject {
  return { ownerId: actor.userId, project }
}

function toPersistenceTimestamp(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000)
}

/** Live Projects service, parameterized by owner-scoped persistence. */
export const ProjectsLive = Layer.effect(
  Projects,
  Effect.gen(function* () {
    const store = yield* ProjectStore

    const listOwned = Effect.fn('Projects.listOwned')(
      function* (
        actor: ProjectActor,
        options: CancellableOptions = {}
      ) {
        yield* ensureRequestActive(
          options,
          () => new ProjectReadCancelled({ operation: 'listOwned' })
        )
        const projects = yield* store.listOwned(actor.userId)
        yield* ensureRequestActive(
          options,
          () => new ProjectReadCancelled({ operation: 'listOwned' })
        )
        return projects.map((project) => owned(actor, project))
      }
    )

    const getOwned = Effect.fn('Projects.getOwned')(
      function* (
        actor: ProjectActor,
        id: ProjectId,
        options: CancellableOptions = {}
      ) {
        yield* ensureRequestActive(
          options,
          () => new ProjectReadCancelled({ operation: 'getOwned' })
        )
        const project = yield* store.findOwned(actor.userId, id)
        yield* ensureRequestActive(
          options,
          () => new ProjectReadCancelled({ operation: 'getOwned' })
        )
        if (Option.isNone(project)) {
          return yield* new ProjectNotFound({ projectId: id })
        }

        return owned(actor, project.value)
      }
    )

    const create = Effect.fn('Projects.create')(
      function* (
        actor: ProjectActor,
        input: CreateProjectInput,
        options: CancellableOptions = {}
      ) {
        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'create',
              mutationCommitted: false,
            })
        )
        const now = toPersistenceTimestamp(yield* DateTime.nowAsDate)
        const storedProject: NewStoredProject = {
          id: input.id,
          userId: actor.userId,
          name: input.name,
          description: input.description,
          visibility: input.visibility,
          revision: INITIAL_PROJECT_REVISION,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }
        const inserted = yield* store.insert(storedProject)

        if (ProjectInsertOutcome.$is('Inserted')(inserted)) {
          yield* ensureRequestActive(
            options,
            () =>
              new ProjectMutationCancelled({
                operation: 'create',
                mutationCommitted: true,
              })
          )
          return CreateProjectOutcome.Created({
            project: owned(actor, storedProject),
          })
        }

        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'create',
              mutationCommitted: false,
            })
        )
        if (ProjectInsertOutcome.$is('LimitReached')(inserted)) {
          return yield* new ProjectLifetimeLimitReached({
            limit: PROJECT_LIFETIME_LIMIT,
          })
        }

        const existing = yield* store.findOwned(actor.userId, input.id)
        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'create',
              mutationCommitted: false,
            })
        )
        if (Option.isNone(existing)) {
          return yield* new ProjectIdConflict({ projectId: input.id })
        }

        return CreateProjectOutcome.Replayed({
          project: owned(actor, existing.value),
        })
      }
    )

    const update = Effect.fn('Projects.update')(
      function* (
        actor: ProjectActor,
        id: ProjectId,
        input: UpdateProjectInput,
        options: CancellableOptions = {}
      ) {
        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'update',
              mutationCommitted: false,
            })
        )
        const existing = yield* store.findOwned(actor.userId, id)
        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'update',
              mutationCommitted: false,
            })
        )
        if (Option.isNone(existing)) {
          return yield* new ProjectNotFound({ projectId: id })
        }
        if (
          existing.value.revision !== input.expectedRevision ||
          existing.value.revision === Number.MAX_SAFE_INTEGER
        ) {
          return yield* new ProjectUpdateConflict({ projectId: id })
        }

        const now = toPersistenceTimestamp(yield* DateTime.nowAsDate)
        const updatedAt = new Date(
          Math.max(now.getTime(), existing.value.updatedAt.getTime())
        )
        const revision = S.decodeUnknownSync(ProjectRevision)(
          input.expectedRevision + 1
        )
        const outcome = yield* store.updateOwned({
          id,
          ownerId: actor.userId,
          name: input.name,
          description: input.description,
          visibility: input.visibility,
          expectedRevision: input.expectedRevision,
          revision,
          updatedAt,
        })

        if (ProjectUpdateOutcome.$is('Conflict')(outcome)) {
          yield* ensureRequestActive(
            options,
            () =>
              new ProjectMutationCancelled({
                operation: 'update',
                mutationCommitted: false,
              })
          )
          return yield* new ProjectUpdateConflict({ projectId: id })
        }

        const project: Project = {
          id,
          userId: actor.userId,
          name: input.name,
          description: input.description,
          visibility: input.visibility,
          revision,
          createdAt: existing.value.createdAt,
          updatedAt,
          deletedAt: null,
        }

        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'update',
              mutationCommitted: true,
            })
        )
        return owned(actor, project)
      }
    )

    const remove = Effect.fn('Projects.remove')(
      function* (
        actor: ProjectActor,
        id: ProjectId,
        expectedRevision: ProjectRevision,
        options: CancellableOptions = {}
      ) {
        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'remove',
              mutationCommitted: false,
            })
        )
        const authorized = yield* store.findOwned(actor.userId, id)
        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'remove',
              mutationCommitted: false,
            })
        )
        if (Option.isNone(authorized)) {
          return DeleteProjectOutcome.AlreadyAbsent()
        }
        if (authorized.value.revision !== expectedRevision) {
          return yield* new ProjectDeleteConflict({ projectId: id })
        }

        const now = toPersistenceTimestamp(yield* DateTime.nowAsDate)
        const deletedAt = new Date(
          Math.max(now.getTime(), authorized.value.updatedAt.getTime())
        )
        const outcome = yield* store.deleteOwned(
          actor.userId,
          id,
          expectedRevision,
          deletedAt
        )
        if (DeleteProjectOutcome.$is('Deleted')(outcome)) {
          yield* ensureRequestActive(
            options,
            () =>
              new ProjectMutationCancelled({
                operation: 'remove',
                mutationCommitted: true,
              })
          )
          return outcome
        }

        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'remove',
              mutationCommitted: false,
            })
        )
        const current = yield* store.findOwned(actor.userId, id)
        yield* ensureRequestActive(
          options,
          () =>
            new ProjectMutationCancelled({
              operation: 'remove',
              mutationCommitted: false,
            })
        )
        if (Option.isSome(current)) {
          return yield* new ProjectDeleteConflict({ projectId: id })
        }

        return outcome
      }
    )

    return Projects.of({
      listOwned,
      getOwned,
      create,
      update,
      remove,
    })
  })
)
