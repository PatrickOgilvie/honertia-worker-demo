import { Link } from '@inertiajs/react'
import type { ReactNode } from 'react'

import Brand from '~/components/Brand'
import usePageTransitionFocus from '~/components/usePageTransitionFocus'

interface AuthShellProps {
  readonly title: string
  readonly description: string
  readonly alternatePrompt: string
  readonly alternateHref: string
  readonly alternateLabel: string
  readonly children: ReactNode
}

/** Provides the shared, responsive shell for authentication journeys. */
export default function AuthShell({
  title,
  description,
  alternatePrompt,
  alternateHref,
  alternateLabel,
  children,
}: AuthShellProps) {
  const { mainRef, announcement } = usePageTransitionFocus()

  return (
    <div className="auth-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <aside className="auth-story">
        <Brand tone="light" />

        <div className="auth-story-copy">
          <p className="eyebrow eyebrow--inverse">Edge-native by default</p>
          <p className="auth-story-title">One request. Every layer in sync.</p>
          <p className="auth-story-description">
            See server-driven routing, typed effects, sessions, and edge
            persistence work together in one small app.
          </p>
        </div>

        <div className="request-preview" aria-hidden="true">
          <div className="request-preview-header">
            <span>Live request</span>
            <span className="request-ready">
              <span className="status-dot" />
              Ready
            </span>
          </div>
          <div className="request-line">
            <code>
              <span>GET</span> /
            </code>
            <span>200 OK</span>
          </div>
          <div className="request-path">
            <span>Hono</span>
            <svg viewBox="0 0 20 8" focusable="false">
              <path d="M1 4h16M14 1l3 3-3 3" />
            </svg>
            <span>Effect</span>
            <svg viewBox="0 0 20 8" focusable="false">
              <path d="M1 4h16M14 1l3 3-3 3" />
            </svg>
            <span>React</span>
          </div>
        </div>

        <p className="auth-story-footer" translate="no">
          Cloudflare Workers <span aria-hidden="true">·</span> D1{' '}
          <span aria-hidden="true">·</span> Better Auth
        </p>
      </aside>

      <span className="route-announcer" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>

      <main ref={mainRef} id="main-content" className="auth-main" tabIndex={-1}>
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <Brand />
          </div>

          <div className="auth-heading">
            <p className="eyebrow">@popcomputer/web demo</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>

          {children}

          <p className="auth-alternate">
            {alternatePrompt}{' '}
            <Link href={alternateHref} className="text-link">
              {alternateLabel}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
