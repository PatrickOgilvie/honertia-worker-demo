import { Schema as S } from 'effect'

import {
  ProjectId,
  PROJECT_LIFETIME_LIMIT,
  ProjectRevision,
  ProjectVisibility,
  type Project,
} from '~/domain/project'
import { IsoTimestamp } from '~/presentation/timestamp'

/** Minimal browser-safe project representation for collection pages. */
export const ProjectSummary = S.Struct({
  id: ProjectId,
  name: S.String.check(S.isMinLength(1), S.isMaxLength(100)),
  description: S.String.check(S.isMaxLength(500)),
  visibility: ProjectVisibility,
  updatedAt: IsoTimestamp,
}).annotate({ identifier: 'ProjectSummary' })

/** Schema-derived project summary sent to the browser. */
export type ProjectSummary = S.Schema.Type<typeof ProjectSummary>

/** Minimal project representation exposed by the anonymous showcase. */
export const PublicProject = S.Struct({
  id: ProjectId,
  name: S.String.check(S.isMinLength(1), S.isMaxLength(100)),
  description: S.String.check(S.isMaxLength(500)),
  visibility: S.Literal('public'),
  updatedAt: IsoTimestamp,
}).annotate({ identifier: 'PublicProject' })

/** Schema-derived project resource safe for anonymous visitors. */
export type PublicProject = S.Schema.Type<typeof PublicProject>

/** Browser-safe project representation for detail and editing pages. */
export const ProjectDetail = S.Struct({
  ...ProjectSummary.fields,
  revision: ProjectRevision,
  createdAt: IsoTimestamp,
}).annotate({ identifier: 'ProjectDetail' })

/** Schema-derived project detail sent to the browser. */
export type ProjectDetail = S.Schema.Type<typeof ProjectDetail>

/** Browser-safe project resource returned by the JSON showcase endpoint. */
export const ProjectApiResource = ProjectDetail.annotate({
  title: 'ProjectResource',
})

/** Runtime and OpenAPI contract for the authenticated project collection API. */
export const ProjectApiIndexResponse = S.Struct({
  projects: S.Array(ProjectApiResource).check(
    S.isMaxLength(PROJECT_LIFETIME_LIMIT)
  ),
}).annotate({ title: 'ProjectIndexResponse' })

/** Project projection used by index pages and other compact views. */
export function toProjectSummary(project: Project): ProjectSummary {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    visibility: project.visibility,
    updatedAt: project.updatedAt.toISOString(),
  }
}

/** Project projection used by detail and editing pages. */
export function toProjectDetail(project: Project): ProjectDetail {
  return {
    ...toProjectSummary(project),
    revision: project.revision,
    createdAt: project.createdAt.toISOString(),
  }
}

/** Projects only the fields consumed by the anonymous showcase. */
export function toPublicProject(
  project: Project & { readonly visibility: 'public' }
): PublicProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    visibility: project.visibility,
    updatedAt: project.updatedAt.toISOString(),
  }
}
