import { Head, Link, usePage } from '@inertiajs/react'

import Layout from '~/components/Layout'
import type { PageProps } from '~/types'

const destinations = [
  {
    id: 'projects',
    href: '/projects',
    title: 'Projects',
    description: 'Create, manage, and publish your D1-backed projects.',
    detail: 'Owner-scoped records',
  },
  {
    id: 'sessions',
    href: '/sessions',
    title: 'Sessions',
    description: 'Review active sessions and revoke access when needed.',
    detail: 'Better Auth security',
  },
] as const

const requestSteps = ['Hono', 'Better Auth', 'Effect', 'React'] as const

const runtimeFacts = [
  { label: 'Route', value: 'GET /' },
  { label: 'Database', value: 'Cloudflare D1' },
  { label: 'Rendering', value: 'Inertia + React' },
] as const

type DestinationId = (typeof destinations)[number]['id']

function DestinationIcon({ id }: { readonly id: DestinationId }) {
  if (id === 'projects') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M3.75 7.25h6.1l2.15 2.2h8.25v9.3H3.75z" />
        <path d="M3.75 7.25V5.5h6.1L12 7.7" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.75" y="5" width="16.5" height="14" rx="3" />
      <path d="M7.75 9.75h8.5M7.75 14h5" />
      <circle cx="17.25" cy="15" r="2.35" />
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4 10h11M11 6l4 4-4 4" />
    </svg>
  )
}

/** Presents the authenticated framework dashboard. */
export default function Dashboard() {
  const { auth } = usePage<PageProps>().props
  const trimmedName = auth?.user?.name?.trim()
  const displayName =
    trimmedName && trimmedName.length > 0
      ? trimmedName
      : (auth?.user?.email ?? 'there')
  const [firstName = displayName] = displayName.split(/\s+/)
  const email = auth?.user?.email ?? ''

  return (
    <>
      <Head title="Dashboard">
        <meta name="theme-color" content="#f5f3ee" />
      </Head>
      <Layout>
        <div className="dashboard">
          <header className="dashboard-welcome">
            <div className="dashboard-welcome-copy">
              <p className="dashboard-overline">
                <span aria-hidden="true" />
                Workspace ready
              </p>
              <h1>Welcome back, {firstName}.</h1>
              <p className="dashboard-intro">
                Your projects and account activity are ready when you are.
              </p>
            </div>
            <p className="dashboard-identity">
              <span>Signed in as</span>
              <strong>{email}</strong>
            </p>
          </header>

          <section
            className="dashboard-destinations"
            aria-labelledby="destinations-title"
          >
            <div className="dashboard-section-heading">
              <div>
                <p className="dashboard-label">Workspace</p>
                <h2 id="destinations-title">Continue where you left off</h2>
              </div>
              <p>Choose a destination. Everything else stays out of the way.</p>
            </div>

            <div className="destination-grid">
              {destinations.map((destination) => (
                <Link
                  key={destination.id}
                  href={destination.href}
                  className={`destination-card destination-card--${destination.id}`}
                >
                  <span className="destination-icon">
                    <DestinationIcon id={destination.id} />
                  </span>
                  <div className="destination-copy">
                    <h3>{destination.title}</h3>
                    <p>{destination.description}</p>
                  </div>
                  <span className="destination-footer">
                    <span>{destination.detail}</span>
                    <span className="destination-arrow">
                      <ArrowIcon />
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="runtime-panel" aria-labelledby="runtime-title">
            <div className="runtime-summary">
              <div>
                <p className="dashboard-label">Latest request</p>
                <h2 id="runtime-title">Everything is working.</h2>
                <p>
                  This page crossed four typed boundaries at the edge before it
                  reached your browser.
                </p>
              </div>
              <span className="runtime-status">
                <span aria-hidden="true" />
                200 OK
              </span>
            </div>

            <ol className="request-track" aria-label="Request lifecycle">
              {requestSteps.map((step, index) => (
                <li key={step}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <strong>{step}</strong>
                </li>
              ))}
            </ol>

            <dl className="runtime-facts">
              {runtimeFacts.map((fact) => (
                <div key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd translate="no">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </Layout>
    </>
  )
}
