import { Head, Link } from '@inertiajs/react'

import Layout from '~/components/Layout'
import type {
  PublicProject as PublicProjectResource,
} from '~/presentation/project'

interface PublicProjectProps {
  readonly project: PublicProjectResource
}

const updatedAtFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'long',
  timeStyle: 'short',
})

function formatUpdatedAt(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : updatedAtFormatter.format(date)
}

/** Presents the current public projection of a project. */
export default function PublicProject({ project }: PublicProjectProps) {
  return (
    <>
      <Head title={`${project.name} — Public showcase`}>
        <meta name="theme-color" content="#f5f3ee" />
        <meta
          name="description"
          content={project.description.trim() || `Public project: ${project.name}`}
        />
      </Head>
      <Layout breadcrumbs={[{ label: 'Public showcase' }]}>
        <article className="public-project">
          <header className="public-project-hero">
            <div className="public-badges">
              <span className="visibility-badge visibility-badge--public">
                <span className="visibility-dot" aria-hidden="true" />
                Public
              </span>
              <span className="privacy-badge">
                <span aria-hidden="true" />
                Live visibility
              </span>
            </div>
            <h1>{project.name}</h1>
            <p>{project.description.trim() || 'No description has been added.'}</p>
          </header>

          <div className="public-project-body">
            <section className="public-story" aria-labelledby="privacy-story-title">
              <p className="eyebrow">@popcomputer/web at work</p>
              <h2 id="privacy-story-title">Public when you say so</h2>
              <p>
                Each visit reads the current project visibility. This page is not
                stored at the edge, so making the project private or deleting it
                takes effect immediately.
              </p>

              <dl className="public-stack-grid">
                <div>
                  <dt>Read model</dt>
                  <dd>Effect Schema</dd>
                </div>
                <div>
                  <dt>Persistence</dt>
                  <dd>Cloudflare D1</dd>
                </div>
                <div>
                  <dt>Delivery</dt>
                  <dd>Always current</dd>
                </div>
              </dl>
            </section>

            <aside className="public-response-card">
              <p className="card-label card-label--inverse">Public response</p>
              <dl>
                <div>
                  <dt>Visibility</dt>
                  <dd>Public projection</dd>
                </div>
                <div>
                  <dt>Updated</dt>
                  <dd>
                    <time dateTime={project.updatedAt}>
                      {formatUpdatedAt(project.updatedAt)}
                    </time>
                  </dd>
                </div>
              </dl>
              <Link href="/projects" className="light-button">
                Open project dashboard
              </Link>
            </aside>
          </div>
        </article>
      </Layout>
    </>
  )
}
