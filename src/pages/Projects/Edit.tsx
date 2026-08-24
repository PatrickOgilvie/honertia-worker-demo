import { Head, Link, useForm } from '@inertiajs/react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'

import Layout from '~/components/Layout'
import ProjectFormFields from '~/components/ProjectFormFields'
import type { ProjectFormValues } from '~/components/ProjectFormFields'
import type { ProjectDetail } from '~/presentation/project'

interface EditProjectProps {
  readonly project: ProjectDetail
}

interface UpdateProjectFormValues extends ProjectFormValues {
  readonly expectedRevision: number
}

/** Updates an owner-scoped project through a strict Effect action. */
export default function EditProject({ project }: EditProjectProps) {
  const formRef = useRef<HTMLFormElement>(null)
  const { data, setData, put, processing, errors, clearErrors } =
    useForm<UpdateProjectFormValues>({
      name: project.name,
      description: project.description,
      visibility: project.visibility,
      expectedRevision: project.revision,
    })

  useEffect(() => {
    if (Object.keys(errors).length === 0) return
    const target =
      formRef.current?.querySelector<HTMLElement>(
        'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]'
      ) ?? formRef.current?.querySelector<HTMLElement>('[role="alert"]')
    target?.focus()
  }, [errors])

  function updateField(field: keyof ProjectFormValues, value: string) {
    switch (field) {
      case 'name':
        setData('name', value)
        break
      case 'description':
        setData('description', value)
        break
      case 'visibility':
        if (value !== 'private' && value !== 'public') return
        setData('visibility', value)
        break
    }
    clearErrors(field)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    put(`/projects/${encodeURIComponent(project.id)}`)
  }

  return (
    <>
      <Head title={`Edit ${project.name}`}>
        <meta name="theme-color" content="#f5f3ee" />
      </Head>
      <Layout
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          {
            label: project.name,
            href: `/projects/${encodeURIComponent(project.id)}`,
          },
          { label: 'Edit' },
        ]}
      >
        <div className="content-narrow">
          <header className="page-heading">
            <p className="eyebrow">Owner-scoped update</p>
            <h1>Edit project</h1>
            <p>
              The project service resolves this record within your owner scope
              before the strict update form is parsed.
            </p>
          </header>

          <form
            ref={formRef}
            className="form-card"
            noValidate
            onSubmit={handleSubmit}
          >
            {errors.expectedRevision ? (
              <div className="form-conflict" role="alert" tabIndex={-1}>
                <p>{errors.expectedRevision}</p>
                <Link
                  href={`/projects/${encodeURIComponent(project.id)}/edit`}
                  className="secondary-link"
                >
                  Reload latest version
                </Link>
              </div>
            ) : null}
            <ProjectFormFields
              data={data}
              errors={errors}
              disabled={processing}
              onChange={updateField}
            />
            <input
              type="hidden"
              name="expectedRevision"
              value={data.expectedRevision}
            />

            <div className="form-actions">
              <Link
                href={`/projects/${encodeURIComponent(project.id)}`}
                className="secondary-link"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={processing}
                className="primary-button primary-button--inline"
                aria-busy={processing}
              >
                {processing ? (
                  <svg
                    className="button-spinner"
                    viewBox="0 0 20 20"
                    aria-hidden="true"
                    focusable="false"
                  >
                    <circle cx="10" cy="10" r="7" />
                  </svg>
                ) : null}
                <span aria-live="polite">
                  {processing ? 'Saving…' : 'Save changes'}
                </span>
              </button>
            </div>
          </form>
        </div>
      </Layout>
    </>
  )
}
