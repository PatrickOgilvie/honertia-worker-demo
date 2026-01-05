import { Link, usePage } from '@inertiajs/react'
import type { PageProps } from '~/types'

interface Breadcrumb {
  label: string
  href?: string
}

interface LayoutProps {
  children: React.ReactNode
  breadcrumbs?: Breadcrumb[]
}

export default function Layout({ children, breadcrumbs = [] }: LayoutProps) {
  const { auth } = usePage<PageProps>().props

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-xl font-semibold text-gray-900">
                Honertia Demo
              </Link>
              {breadcrumbs.map((crumb, index) => (
                <span key={index} className="flex items-center space-x-4">
                  <span className="text-gray-300">|</span>
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-gray-600 hover:text-gray-900"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-gray-600">{crumb.label}</span>
                  )}
                </span>
              ))}
            </div>
            <div className="flex items-center space-x-4">
              {auth?.user && (
                <>
                  <span className="text-gray-700">
                    {auth.user.name || auth.user.email}
                  </span>
                  <Link
                    href="/logout"
                    method="post"
                    as="button"
                    className="text-gray-500 hover:text-gray-700"
                  >
                    Logout
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">{children}</div>
      </main>
    </div>
  )
}
