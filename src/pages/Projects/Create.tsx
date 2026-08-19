import { Head, Link, useForm } from '@inertiajs/react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'

import Layout from '~/components/Layout'
import ProjectFormFields from '~/components/ProjectFormFields'
import type { ProjectFormValues } from '~/components/ProjectFormFields'

interface CreateProjectForm extends ProjectFormValues {
  readonly id: string
}

/** Creates a project through the schema-validated Effect action. */
export default function CreateProject() {
  const formRef = useRef<HTMLFormElement>(null)
  const { data, setData, post, processing, errors, clearErrors } =
    useForm<CreateProjectForm>(() => ({
      id: crypto.randomUUID(),
      name: '',
      description: '',
      visibility: 'private',
    }))

  useEffect(() => {
    if (Object.keys(errors).length === 0) return
    formRef.current
      ?.querySelector<HTMLElement>(
        'input[aria-invalid="true"], textarea[aria-invalid="true"], select[aria-invalid="true"]'
      )
      ?.focus()
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
    post('/projects')
  }

  return (
    <>
      <Head title="Create project">
        <meta name="theme-color" content="#f5f3ee" />
      </Head>
      <Layout
        breadcrumbs={[
          { label: 'Projects', href: '/projects' },
          { label: 'Create' },
        ]}
      >
        <div className="content-narrow">
          <header className="page-heading">
            <p className="eyebrow">Schema-validated write</p>
            <h1>Create a project</h1>
            <p>
              Unknown fields are rejected and failures remain typed all the way
              back to this form.
            </p>
          </header>

          <form
            ref={formRef}
            className="form-card"
            noValidate
            onSubmit={handleSubmit}
          >
            <ProjectFormFields
              data={data}
              errors={errors}
              disabled={processing}
              onChange={updateField}
            />

            <div className="form-actions">
              <Link href="/projects" className="secondary-link">
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
                  {processing ? 'Creating…' : 'Create project'}
                </span>
              </button>
            </div>
          </form>
        </div>
      </Layout>
    </>
  )
}
