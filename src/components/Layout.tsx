import { Link, usePage } from '@inertiajs/react'
import Brand from '~/components/Brand'
import usePageTransitionFocus from '~/components/usePageTransitionFocus'
import type { PageProps } from '~/types'

interface Breadcrumb {
  readonly label: string
  readonly href?: string
}

interface LayoutProps {
  readonly children: React.ReactNode
  readonly breadcrumbs?: ReadonlyArray<Breadcrumb>
}

const primaryNavigation = [
  { label: 'Dashboard', href: '/' },
  { label: 'Projects', href: '/projects' },
  { label: 'Sessions', href: '/sessions' },
] as const

function isActivePath(currentPath: string, href: string): boolean {
  if (href === '/') return currentPath === href
  return currentPath === href || currentPath.startsWith(`${href}/`)
}

/** Renders the authenticated application shell and responsive account header. */
export default function Layout({ children, breadcrumbs = [] }: LayoutProps) {
  const page = usePage<PageProps>()
  const { auth } = page.props
  const currentPath = page.url.split(/[?#]/)[0] || '/'
  const user = auth?.user
  const trimmedName = user?.name?.trim()
  const displayName =
    trimmedName && trimmedName.length > 0 ? trimmedName : (user?.email ?? '')
  const avatarLabel = displayName.slice(0, 1).toUpperCase() || '?'
  const { mainRef, announcement } = usePageTransitionFocus()

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-identity">
            <Brand />
            {breadcrumbs.length > 0 ? (
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                <ol>
                  {breadcrumbs.map((crumb) => (
                    <li key={`${crumb.href ?? 'current'}:${crumb.label}`}>
                      <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path d="m4.5 2.5 3 3-3 3" />
                      </svg>
                      {crumb.href ? (
                        <Link href={crumb.href}>{crumb.label}</Link>
                      ) : (
                        <span aria-current="page">{crumb.label}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
          </div>

          {user ? (
            <nav className="primary-nav" aria-label="Primary navigation">
              {primaryNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={
                    isActivePath(currentPath, item.href) ? 'page' : undefined
                  }
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          ) : null}

          {user ? (
            <div className="account-menu">
              <span className="account-avatar" aria-hidden="true">
                {avatarLabel}
              </span>
              <div className="account-copy">
                <span className="account-name">{displayName}</span>
                {trimmedName ? (
                  <span className="account-email">{user.email}</span>
                ) : null}
              </div>
              <Link
                href="/logout"
                method="post"
                as="button"
                type="button"
                className="sign-out-button"
                aria-label={`Sign out ${displayName}`}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M8 4H4.8A1.8 1.8 0 0 0 3 5.8v8.4A1.8 1.8 0 0 0 4.8 16H8M12.5 6.5 16 10l-3.5 3.5M7 10h9" />
                </svg>
                <span>Sign out</span>
              </Link>
            </div>
          ) : null}
        </div>
      </header>

      <span className="route-announcer" aria-live="polite" aria-atomic="true">
        {announcement}
      </span>

      <main ref={mainRef} id="main-content" className="app-main" tabIndex={-1}>
        {children}
      </main>
    </div>
  )
}
