import { Head, useForm } from '@inertiajs/react'
import { useEffect, useRef } from 'react'
import type { FormEvent } from 'react'

import AuthShell from '~/components/AuthShell'
import TextField from '~/components/TextField'

export default function Login() {
  const { data, setData, post, processing, errors, clearErrors } = useForm({
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
    post('/login')
  }

  return (
    <>
      <Head title="Sign in">
        <meta name="theme-color" content="#f5f3ee" />
      </Head>
      <AuthShell
        title="Welcome back"
        description="Sign in to continue exploring a server-driven React app at the edge."
        alternatePrompt="New to the demo?"
        alternateHref="/register"
        alternateLabel="Create an account"
      >
        <form ref={formRef} className="auth-form" onSubmit={handleSubmit}>
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
            autoComplete="current-password"
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
              {processing ? 'Signing in…' : 'Sign in'}
            </span>
          </button>
        </form>
      </AuthShell>
    </>
  )
}
