import { Link, usePage } from '@inertiajs/react'
import Layout from '~/components/Layout'
import type { PageProps } from '~/types'

interface ErrorProps {
  status?: number
  message?: string
  hint?: string
}

export default function ErrorPage() {
  const { props } = usePage<PageProps<ErrorProps>>()
  const status = props.status ?? 500
  const message = props.message ?? 'Something went wrong. Please try again later.'

  return (
    <Layout>
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600 tracking-wide uppercase">
            Error {status}
          </p>
          <h1 className="mt-3 text-3xl font-bold text-gray-900">Something went wrong</h1>
        </div>
        <p className="text-gray-600 max-w-xl">{message}</p>
        {props.hint && (
          <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 max-w-xl">
            <p className="text-sm text-amber-800">{props.hint}</p>
          </div>
        )}
        <div className="space-x-4">
          <Link
            href="/"
            className="inline-flex items-center px-5 py-2 border border-transparent text-sm font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Go back home
          </Link>
          <Link
            href="/projects"
            className="inline-flex items-center px-5 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            View projects
          </Link>
        </div>
      </div>
    </Layout>
  )
}
