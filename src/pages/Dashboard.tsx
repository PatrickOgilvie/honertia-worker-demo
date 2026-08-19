import { Head, Link, usePage } from '@inertiajs/react'

import Layout from '~/components/Layout'
import type { PageProps } from '~/types'

const capabilities = [
  {
    id: 'routing',
    label: '@popcomputer/web',
    description: 'Server-driven routing with instant client-side navigation.',
    detail: 'Routing + actions',
  },
  {
    id: 'database',
    label: 'Cloudflare D1',
    description: 'SQLite-compatible persistence deployed alongside your Worker.',
    detail: 'Edge persistence',
  },
  {
    id: 'auth',
    label: 'Better Auth',
    description: 'Session-backed authentication protecting server routes.',
    detail: 'Secure sessions',
  },
] as const

const requestSteps = [
  {
    label: 'Route matched',
    detail: 'Hono resolves the protected route at the edge.',
  },
  {
    label: 'Session verified',
    detail: 'Better Auth supplies the signed-in user.',
  },
  {
    label: 'Effect executed',
    detail: 'Typed services compose the server workflow.',
  },
  {
    label: 'Page hydrated',
    detail: 'React receives narrow, server-owned props.',
  },
] as const

const showcaseDestinations = [
  {
    id: 'projects',
    href: '/projects',
    kicker: 'Effect-native CRUD',
    title: 'Projects',
    description:
      'Create, bind, authorize, and publish a D1 record through one typed workflow.',
    features: ['Strict schemas', 'Route binding', 'Cache purges'],
    action: 'Explore projects',
  },
  {
    id: 'sessions',
    href: '/sessions',
    kicker: 'New in v0.4',
    title: 'Sessions',
    description:
      'Call Better Auth through Effect, inspect live sessions, and revoke one with typed failures.',
    features: ['effectifyBetterAuth', 'Typed errors', 'Session revoke'],
    action: 'Review sessions',
  },
] as const

function CapabilityIcon({ id }: { readonly id: (typeof capabilities)[number]['id'] }) {
  if (id === 'routing') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="4" y="4" width="6" height="6" rx="1.5" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" />
        <path d="M10 7h2a5 5 0 0 1 5 5v2M14 17h-2a5 5 0 0 1-5-5v-2" />
      </svg>
    )
  }

  if (id === 'database') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <ellipse cx="12" cy="6" rx="7" ry="3" />
        <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
      <rect x="4" y="10" width="16" height="11" rx="3" />
      <path d="M12 14v3" />
    </svg>
  )
}

function ShowcaseIcon({
  id,
}: {
  readonly id: (typeof showcaseDestinations)[number]['id']
}) {
  if (id === 'projects') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M4 7.5h6l2 2h8v9.5H4z" />
        <path d="M4 7.5V5h6l2 2" />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="5" width="16" height="14" rx="3" />
      <path d="M8 10h8M8 14h5" />
      <circle cx="17" cy="15" r="2.5" />
    </svg>
  )
}

/** Presents the authenticated framework showcase. */
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
          <section className="dashboard-hero" aria-labelledby="dashboard-title">
            <div className="hero-copy">
              <div className="session-pill">
                <span className="status-dot" aria-hidden="true" />
                Authenticated session
              </div>
              <p className="eyebrow">Edge-native application</p>
              <h1 id="dashboard-title">Welcome, {firstName}</h1>
              <p className="hero-description">
                Your request crossed routing, authentication, and a typed Effect
                workflow before this React page appeared—without a full reload.
              </p>
              <div className="signed-in-as">
                <span>Signed in as</span>
                <strong>{email}</strong>
              </div>
              <div className="hero-actions">
                <Link href="/projects" className="primary-link">
                  Explore projects
                  <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                    <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />
                  </svg>
                </Link>
                <Link href="/sessions" className="secondary-link">
                  Review sessions
                </Link>
              </div>
            </div>

            <div className="live-request" aria-label="Current request flow">
              <div className="live-request-header">
                <div>
                  <span className="live-request-kicker">Latest request</span>
                  <strong>Dashboard</strong>
                </div>
                <span className="request-duration">200 OK</span>
              </div>
              <div className="route-line">
                <code>
                  <span>GET</span> /
                </code>
                <span>Protected</span>
              </div>
              <ol className="route-flow">
                <li>
                  <span>01</span>
                  Hono
                </li>
                <li>
                  <span>02</span>
                  Auth
                </li>
                <li>
                  <span>03</span>
                  Effect
                </li>
                <li>
                  <span>04</span>
                  React
                </li>
              </ol>
            </div>
          </section>

          <section className="showcase-section" aria-labelledby="showcase-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Try the v4 paths</p>
                <h2 id="showcase-title">The new capabilities, in motion</h2>
              </div>
              <p>
                Two focused journeys turn the framework&apos;s latest typed
                boundaries into something you can click through.
              </p>
            </div>

            <div className="showcase-grid">
              {showcaseDestinations.map((showcase) => {
                const titleId = `showcase-${showcase.id}-title`
                return (
                  <Link
                    key={showcase.id}
                    href={showcase.href}
                    className={`showcase-card showcase-card--${showcase.id}`}
                    aria-labelledby={titleId}
                  >
                    <div className="showcase-card-header">
                      <span className="showcase-icon">
                        <ShowcaseIcon id={showcase.id} />
                      </span>
                      <span className="showcase-kicker">{showcase.kicker}</span>
                    </div>
                    <h3 id={titleId}>{showcase.title}</h3>
                    <p>{showcase.description}</p>
                    <ul
                      className="showcase-features"
                      aria-label={`${showcase.title} highlights`}
                    >
                      {showcase.features.map((feature) => (
                        <li key={feature}>{feature}</li>
                      ))}
                    </ul>
                    <span className="showcase-action">
                      {showcase.action}
                      <svg
                        viewBox="0 0 20 20"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />
                      </svg>
                    </span>
                  </Link>
                )
              })}
            </div>
          </section>

          <section className="dashboard-section" aria-labelledby="stack-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Under the hood</p>
                <h2 id="stack-title">A small stack with deep seams</h2>
              </div>
              <p>
                Each layer owns one job, while the page remains fast and
                pleasantly ordinary to use.
              </p>
            </div>

            <dl className="capability-grid">
              {capabilities.map((capability) => (
                <div className="capability-card" key={capability.id}>
                  <span className={`capability-icon capability-icon--${capability.id}`}>
                    <CapabilityIcon id={capability.id} />
                  </span>
                  <dt translate="no">{capability.label}</dt>
                  <dd>{capability.description}</dd>
                  <span className="capability-detail">{capability.detail}</span>
                </div>
              ))}
            </dl>
          </section>

          <section className="journey-panel" aria-labelledby="journey-title">
            <div className="journey-intro">
              <p className="eyebrow">One request, end to end</p>
              <h2 id="journey-title">The invisible work stays invisible.</h2>
              <p>
                The demo keeps boundaries explicit on the server and the
                experience effortless in the browser.
              </p>
            </div>
            <ol className="journey-list">
              {requestSteps.map((step, index) => (
                <li key={step.label}>
                  <span className="journey-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </Layout>
    </>
  )
}
