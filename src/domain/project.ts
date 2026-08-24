import { Schema as S } from 'effect'

import { requiredString, trimmed, uuid } from '@popcomputer/web/schema'
import { UserId } from '~/domain/identity'

/** Hard lifetime bound for active and retired project identifiers per account. */
export const PROJECT_LIFETIME_LIMIT = 100

const ProjectName = S.String.check(
  S.isMinLength(1, { message: 'This field is required' }),
  S.isMaxLength(100, { message: 'Use 100 characters or fewer' })
).pipe(S.decodeTo(requiredString))

const ProjectDescription = S.String.check(
  S.isMaxLength(500, { message: 'Use 500 characters or fewer' })
).pipe(S.decodeTo(trimmed))

/** Stable identifier supplied with the create form so retried submissions keep one identity. */
export const ProjectId = uuid.pipe(S.brand('ProjectId'))

/** A parsed project identifier. */
export type ProjectId = S.Schema.Type<typeof ProjectId>

/** Visibility states supported by a project. */
export const ProjectVisibility = S.Literals(['private', 'public'])

/** Whether a project is private to its owner or visible on its public showcase URL. */
export type ProjectVisibility = S.Schema.Type<typeof ProjectVisibility>

/** Monotonic persistence revision used for optimistic project updates. */
export const ProjectRevision = S.Number.check(
  S.isInt({ message: 'The project revision must be an integer' }),
  S.isBetween(
    {
      minimum: 1,
      maximum: Number.MAX_SAFE_INTEGER,
    },
    { message: 'The project revision is outside the supported range' }
  )
).pipe(S.brand('ProjectRevision'))

/** A parsed project revision. */
export type ProjectRevision = S.Schema.Type<typeof ProjectRevision>

const SubmittedProjectRevision = S.Union([
  ProjectRevision,
  S.NumberFromString.pipe(S.decodeTo(ProjectRevision)),
])

const ProjectFields = {
  id: ProjectId,
  userId: UserId,
  name: ProjectName,
  description: ProjectDescription,
  visibility: ProjectVisibility,
  revision: ProjectRevision,
  createdAt: S.Date,
  updatedAt: S.Date,
} as const

/** Parsed active project; an active row must carry an explicit null retirement marker. */
export const Project = S.Struct({
  ...ProjectFields,
  deletedAt: S.Null,
}).annotate({ identifier: 'Project' })

/** An active project reconstructed from persistence. */
export interface Project extends S.Schema.Type<typeof Project> {}

/** Persisted row parser used where active and retired projects must be distinguished. */
export const StoredProject = S.Struct({
  ...ProjectFields,
  deletedAt: S.NullOr(S.Date),
}).annotate({ identifier: 'StoredProject' })

/** A project row with an explicit lifecycle marker. */
export interface StoredProject extends S.Schema.Type<typeof StoredProject> {}

/** Strict command accepted when a user creates a project. */
export const CreateProjectInput = S.Struct({
  id: ProjectId,
  name: ProjectName,
  description: ProjectDescription,
  visibility: ProjectVisibility,
}).annotate({ identifier: 'CreateProjectInput' })

/** Parsed create-project command. */
export interface CreateProjectInput
  extends S.Schema.Type<typeof CreateProjectInput> {}

/** Strict command accepted when a user changes a project. */
export const UpdateProjectInput = S.Struct({
  name: ProjectName,
  description: ProjectDescription,
  visibility: ProjectVisibility,
  expectedRevision: SubmittedProjectRevision,
}).annotate({ identifier: 'UpdateProjectInput' })

/** Parsed update-project command. */
export interface UpdateProjectInput
  extends S.Schema.Type<typeof UpdateProjectInput> {}

/** Strict command accepted when a user deletes a project. */
export const DeleteProjectInput = S.Struct({
  expectedRevision: SubmittedProjectRevision,
}).annotate({ identifier: 'DeleteProjectInput' })

/** Parsed delete-project command. */
export interface DeleteProjectInput
  extends S.Schema.Type<typeof DeleteProjectInput> {}

/** UUID path parameter shared by project route-model bindings. */
export const ProjectParams = S.Struct({ project: ProjectId }).annotate({
  identifier: 'ProjectParams',
})

/** Route-model parsers installed at the application composition boundary. */
export const projectRouteBindings = { project: StoredProject } as const
