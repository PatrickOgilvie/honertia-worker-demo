import { Schema as S } from 'effect'

import {
  ProjectId,
  ProjectVisibility,
  type Project,
} from '~/domain/project'
import type { ProjectDetail, ProjectSummary } from '~/types'

const IsoTimestamp = S.String.annotate({ format: 'date-time' }).check(
  S.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
)

/** Browser-safe project resource returned by the JSON showcase endpoint. */
export const ProjectApiResource = S.Struct({
  id: ProjectId,
  name: S.String.check(S.isMinLength(1), S.isMaxLength(100)),
  description: S.String.check(S.isMaxLength(500)),
  visibility: ProjectVisibility,
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
}).annotate({ title: 'ProjectResource' })

/** Runtime and OpenAPI contract for the authenticated project collection API. */
export const ProjectApiIndexResponse = S.Struct({
  projects: S.Array(ProjectApiResource),
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
    createdAt: project.createdAt.toISOString(),
  }
}
