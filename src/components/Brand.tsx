import { Link } from '@inertiajs/react'

interface BrandProps {
  readonly tone?: 'dark' | 'light'
}

/** Renders the shared package identity and links back to the dashboard. */
export default function Brand({ tone = 'dark' }: BrandProps) {
  return (
    <Link
      href="/"
      className={`brand brand--${tone}`}
      aria-label="@popcomputer/web demo — dashboard"
    >
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 36 36" focusable="false">
          <rect x="8" y="8" width="7" height="7" rx="2" />
          <rect x="21" y="21" width="7" height="7" rx="2" />
          <path d="M15 11.5h2.5a7.5 7.5 0 0 1 7.5 7.5v2" />
          <path d="M21 24.5h-2.5A7.5 7.5 0 0 1 11 17v-2" />
        </svg>
      </span>
      <span className="brand-lockup" translate="no">
        <span className="brand-name">@popcomputer</span>
        <span className="brand-product">/web</span>
      </span>
      <span className="brand-badge">Demo</span>
    </Link>
  )
}
