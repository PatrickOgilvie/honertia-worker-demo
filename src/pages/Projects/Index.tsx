import { Link, router } from '@inertiajs/react'

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  createdAt: Date
}

interface Props {
  projects: Project[]
}

export default function ProjectsIndex({ projects }: Props) {
  function handleDelete(id: string) {
    if (confirm('Are you sure you want to delete this project?')) {
      router.delete(`/projects/${id}`)
    }
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-xl font-semibold text-gray-900">
                Honertia Demo
              </Link>
              <span className="text-gray-300">|</span>
              <span className="text-gray-600">Projects</span>
            </div>
            <div className="flex items-center">
              <Link
                href="/logout"
                method="post"
                as="button"
                className="text-gray-500 hover:text-gray-700"
              >
                Logout
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <Link
              href="/projects/create"
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              New Project
            </Link>
          </div>

          {projects.length === 0 ? (
            <div className="bg-white shadow rounded-lg p-6 text-center">
              <p className="text-gray-500">
                No projects yet. Create your first project!
              </p>
            </div>
          ) : (
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <ul className="divide-y divide-gray-200">
                {projects.map((project) => (
                  <li key={project.id}>
                    <div className="px-4 py-4 flex items-center justify-between sm:px-6">
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/projects/${project.id}`}
                          className="block hover:bg-gray-50"
                        >
                          <p className="text-sm font-medium text-indigo-600 truncate">
                            {project.name}
                          </p>
                          {project.description && (
                            <p className="mt-1 text-sm text-gray-500 truncate">
                              {project.description}
                            </p>
                          )}
                        </Link>
                      </div>
                      <div className="ml-4 flex items-center space-x-4">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            project.status === 'active'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {project.status}
                        </span>
                        <button
                          onClick={() => handleDelete(project.id)}
                          className="text-red-600 hover:text-red-900 text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
