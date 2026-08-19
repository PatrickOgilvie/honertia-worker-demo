import { Schema as S } from 'effect'

import { requiredString, trimmed, uuid } from '@popcomputer/web/schema'

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

/** Parsed representation of one persisted project row. */
export const Project = S.Struct({
  id: ProjectId,
  userId: S.String,
  name: ProjectName,
  description: ProjectDescription,
  visibility: ProjectVisibility,
  createdAt: S.Date,
  updatedAt: S.Date,
}).annotate({ identifier: 'Project' })

/** A project reconstructed from persistence. */
export interface Project extends S.Schema.Type<typeof Project> {}

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
}).annotate({ identifier: 'UpdateProjectInput' })

/** Parsed update-project command. */
export interface UpdateProjectInput
  extends S.Schema.Type<typeof UpdateProjectInput> {}

/** UUID path parameter shared by project route-model bindings. */
export const ProjectParams = S.Struct({ project: ProjectId }).annotate({
  identifier: 'ProjectParams',
})

/** Route-model parsers installed at the application composition boundary. */
export const projectRouteBindings = { project: Project } as const
