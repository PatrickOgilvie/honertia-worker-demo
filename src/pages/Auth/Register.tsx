import { Head, useForm } from '@inertiajs/react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'

import AuthShell from '~/components/AuthShell'
import TextField from '~/components/TextField'

export default function Register() {
  const { data, setData, post, processing, errors, clearErrors } = useForm({
    name: '',
    email: '',
    password: '',
  })
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (Object.keys(errors).length === 0) return
    formRef.current
      ?.querySelector<HTMLInputElement>('[aria-invalid="true"]')
      ?.focus()
  }, [errors])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    post('/register')
  }

  return (
    <>
      <Head title="Create account">
        <meta name="theme-color" content="#f5f3ee" />
      </Head>
      <AuthShell
        title="Create your demo account"
        description="Explore protected routes, typed server actions, and edge-ready persistence."
        alternatePrompt="Already have an account?"
        alternateHref="/login"
        alternateLabel="Sign in"
      >
        <form ref={formRef} className="auth-form" onSubmit={handleSubmit}>
          <TextField
            id="name"
            name="name"
            type="text"
            label="Full name"
            autoComplete="name"
            required
            value={data.name}
            error={errors.name}
            onChange={(event) => {
              setData('name', event.target.value)
              clearErrors('name')
            }}
          />
          <TextField
            id="email"
            name="email"
            type="email"
            label="Email address"
            autoComplete="email"
            spellCheck={false}
            required
            value={data.email}
            error={errors.email}
            onChange={(event) => {
              setData('email', event.target.value)
              clearErrors('email')
            }}
          />
          <TextField
            id="password"
            name="password"
            type="password"
            label="Password"
            autoComplete="new-password"
            required
            value={data.password}
            error={errors.password}
            onChange={(event) => {
              setData('password', event.target.value)
              clearErrors('password')
            }}
          />

          <button
            type="submit"
            disabled={processing}
            className="primary-button"
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
              {processing ? 'Creating account…' : 'Create account'}
            </span>
          </button>
        </form>
      </AuthShell>
    </>
  )
}
