import type { ProjectVisibility } from '~/domain/project'

interface ProjectVisibilityBadgeProps {
  readonly visibility: ProjectVisibility
}

/** Displays a project's visibility with a consistent semantic status treatment. */
export default function ProjectVisibilityBadge({
  visibility,
}: ProjectVisibilityBadgeProps) {
  return (
    <span className={`visibility-badge visibility-badge--${visibility}`}>
      <span className="visibility-dot" aria-hidden="true" />
      {visibility === 'public' ? 'Public' : 'Private'}
    </span>
  )
}
