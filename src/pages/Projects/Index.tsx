import { Head, Link } from '@inertiajs/react'

import Layout from '~/components/Layout'
import ProjectVisibilityBadge from '~/components/ProjectVisibilityBadge'
import type { ProjectSummary } from '~/presentation/project'

interface ProjectsIndexProps {
  readonly projects: ReadonlyArray<ProjectSummary>
}

const updatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : updatedAtFormatter.format(date)
}

/** Lists the signed-in user's projects and their public showcase status. */
export default function ProjectsIndex({ projects }: ProjectsIndexProps) {
  return (
    <>
      <Head title="Projects">
        <meta name="theme-color" content="#f5f3ee" />
      </Head>
      <Layout breadcrumbs={[{ label: 'Projects' }]}>
        <div className="page-stack">
          <header className="page-heading-row">
            <div className="page-heading">
              <p className="eyebrow">Typed CRUD at the edge</p>
              <h1>Projects</h1>
              <p>
                Every record is loaded through Effect, scoped to your session,
                and parsed before it reaches D1.
              </p>
            </div>
            <Link href="/projects/create" className="primary-link compact-action">
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M10 4v12M4 10h12" />
              </svg>
              New project
            </Link>
          </header>

          {projects.length === 0 ? (
            <section className="empty-state" aria-labelledby="empty-projects-title">
              <span className="empty-state-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" focusable="false">
                  <path d="M4 7.5h6l2 2h8v9.5H4zM4 7.5V5h6l2 2" />
                </svg>
              </span>
              <h2 id="empty-projects-title">Create your first project</h2>
              <p>
                Exercise strict validation, a typed database write, and an
                ownership check in one short flow.
              </p>
              <Link href="/projects/create" className="primary-link compact-action">
                Create a project
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />
                </svg>
              </Link>
            </section>
          ) : (
            <ul className="project-grid" aria-label="Your projects">
              {projects.map((project) => (
                <li className="project-card" key={project.id}>
                  <div className="project-card-topline">
                    <span className="project-mark" aria-hidden="true">
                      {project.name.slice(0, 1).toUpperCase() || 'P'}
                    </span>
                    <ProjectVisibilityBadge visibility={project.visibility} />
                  </div>
                  <Link
                    href={`/projects/${encodeURIComponent(project.id)}`}
                    className="project-card-title"
                  >
                    {project.name}
                  </Link>
                  <p className="project-card-description">
                    {project.description.trim() || 'No description yet.'}
                  </p>
                  <div className="project-card-footer">
                    <span>
                      Updated{' '}
                      <time dateTime={project.updatedAt}>
                        {formatUpdatedAt(project.updatedAt)}
                      </time>
                    </span>
                    {project.visibility === 'public' ? (
                      <Link
                        href={`/showcase/projects/${encodeURIComponent(project.id)}`}
                        className="inline-link"
                      >
                        Public page
                        <span aria-hidden="true">↗</span>
                      </Link>
                    ) : (
                      <span>Owner only</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Layout>
    </>
  )
}
