import { Head, Link, useForm } from '@inertiajs/react'
import { useEffect, useState } from 'react'

import ConfirmationDialog from '~/components/ConfirmationDialog'
import Layout from '~/components/Layout'
import ProjectVisibilityBadge from '~/components/ProjectVisibilityBadge'
import type { ProjectDetail } from '~/presentation/project'

interface ShowProjectProps {
  readonly project: ProjectDetail
}

const timestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatTimestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : timestampFormatter.format(date)
}

/** Presents an owner-authorized project with update and guarded delete actions. */
export default function ShowProject({ project }: ShowProjectProps) {
  const {
    delete: destroy,
    errors,
    processing,
    setData,
  } = useForm({ expectedRevision: project.revision })
  const [confirmsDelete, setConfirmsDelete] = useState(false)
  const projectPath = `/projects/${encodeURIComponent(project.id)}`

  useEffect(() => {
    setData('expectedRevision', project.revision)
  }, [project.revision, setData])

  function handleDelete() {
    destroy(projectPath, {
      onSuccess: () => setConfirmsDelete(false),
    })
  }

  return (
    <>
      <Head title={project.name}>
        <meta name="theme-color" content="#f5f3ee" />
      </Head>
      <Layout
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: project.name },
        ]}
      >
        <div className="page-stack">
          <header className="project-detail-header">
            <div className="page-heading">
              <div className="heading-badges">
                <p className="eyebrow">Owner-scoped project</p>
                <ProjectVisibilityBadge visibility={project.visibility} />
              </div>
              <h1>{project.name}</h1>
            </div>
            <div className="page-actions">
              {project.visibility === 'public' ? (
                <Link
                  href={`/showcase/projects/${encodeURIComponent(project.id)}`}
                  className="secondary-link"
                >
                  Public page
                  <span aria-hidden="true">↗</span>
                </Link>
              ) : null}
              <Link href={`${projectPath}/edit`} className="primary-link compact-action">
                Edit project
              </Link>
            </div>
          </header>

          <div className="project-detail-layout">
            <article className="project-description-card">
              <p className="card-label">Description</p>
              <p className="project-description">
                {project.description.trim() || 'No description has been added.'}
              </p>

              <div className="request-story">
                <p className="card-label card-label--inverse">Request path</p>
                <ol>
                  <li>
                    <span>01</span>
                    <strong>Request authenticated</strong>
                  </li>
                  <li>
                    <span>02</span>
                    <strong>Owner-scoped lookup</strong>
                  </li>
                  <li>
                    <span>03</span>
                    <strong>Safe props rendered</strong>
                  </li>
                </ol>
              </div>
            </article>

            <aside className="detail-sidebar">
              <section className="detail-card">
                <h2>Project details</h2>
                <dl>
                  <div>
                    <dt>Created</dt>
                    <dd>
                      <time dateTime={project.createdAt}>
                        {formatTimestamp(project.createdAt)}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>
                      <time dateTime={project.updatedAt}>
                        {formatTimestamp(project.updatedAt)}
                      </time>
                    </dd>
                  </div>
                  <div>
                    <dt>Identifier</dt>
                    <dd className="project-id">{project.id}</dd>
                  </div>
                </dl>
              </section>

              <section className="danger-zone">
                <h2>Delete project</h2>
                <p>
                  Removes its content and retires this identifier for the
                  lifetime of your account.
                </p>
                <button
                  type="button"
                  className="danger-outline-button"
                  disabled={processing}
                  onClick={() => setConfirmsDelete(true)}
                >
                  Delete project
                </button>
              </section>
            </aside>
          </div>
        </div>
      </Layout>

      <ConfirmationDialog
        open={confirmsDelete}
        title="Delete project?"
        description={`This removes “${project.name}” and retires its identifier for the lifetime of your account. This action can’t be undone.`}
        confirmLabel="Delete project"
        busyLabel="Deleting…"
        busy={processing}
        error={errors.expectedRevision}
        onCancel={() => setConfirmsDelete(false)}
        onConfirm={handleDelete}
      />
    </>
  )
}
