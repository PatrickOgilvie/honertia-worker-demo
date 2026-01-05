import { Link, usePage } from '@inertiajs/react'
import Layout from '~/components/Layout'
import type { PageProps } from '~/types'

export default function Dashboard() {
  const { auth } = usePage<PageProps>().props
  const userName = auth?.user?.name || auth?.user?.email || 'User'

  return (
    <Layout>
      <div className="bg-white overflow-hidden shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">
            Welcome, {userName}!
          </h2>
          <p className="text-gray-600 mb-6">
            This is a demo application built with Honertia, showcasing
            server-driven SPA architecture on Cloudflare Workers with D1
            database and better-auth authentication.
          </p>
          <div className="space-y-4">
            <Link
              href="/projects"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              View Projects
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">
              Framework
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">
              Honertia
            </dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">
              Database
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">D1</dd>
          </div>
        </div>
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="px-4 py-5 sm:p-6">
            <dt className="text-sm font-medium text-gray-500 truncate">
              Authentication
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-gray-900">
              better-auth
            </dd>
          </div>
        </div>
      </div>
    </Layout>
  )
}
