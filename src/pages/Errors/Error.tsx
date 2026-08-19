import { Head, Link, usePage } from '@inertiajs/react'

import Layout from '~/components/Layout'
import type { PageProps } from '~/types'

interface ErrorProps {
  readonly status?: number
  readonly message?: string
  readonly hint?: string
}

interface ErrorContent {
  readonly title: string
  readonly description: string
}

function getErrorContent(status: number): ErrorContent {
  switch (status) {
    case 401:
      return {
        title: 'Sign in to continue',
        description: 'Your session may have expired. Sign in again to keep going.',
      }
    case 403:
      return {
        title: 'You don’t have access',
        description: 'This page belongs to a different account or permission level.',
      }
    case 404:
      return {
        title: 'That page isn’t here',
        description: 'The address may be outdated, or the page may have moved.',
      }
    case 422:
      return {
        title: 'We couldn’t complete that request',
        description: 'Review the information you entered, then try once more.',
      }
    default:
      return {
        title: 'Something went wrong',
        description: 'The request did not finish, but you can safely try again.',
      }
  }
}

/** Presents a status-aware error with a clear recovery path. */
export default function ErrorPage() {
  const { props } = usePage<PageProps<ErrorProps>>()
  const status = props.status ?? 500
  const content = getErrorContent(status)
  const message = props.message ?? content.description
  const isUnauthorized = status === 401

  return (
    <>
      <Head title={`${status} — ${content.title}`}>
        <meta name="theme-color" content="#f5f3ee" />
      </Head>
      <Layout>
        <section className="error-page" aria-labelledby="error-title">
          <div className="error-code" aria-hidden="true">
            {status}
          </div>
          <div className="error-content">
            <p className="eyebrow">Error {status}</p>
            <h1 id="error-title">{content.title}</h1>
            <p className="error-description">{message}</p>

            {props.hint ? (
              <div className="error-hint" role="note">
                <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                  <path d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
                  <path d="M10 9v5M10 6.2h.01" />
                </svg>
                <div>
                  <strong>Technical detail</strong>
                  <p>{props.hint}</p>
                </div>
              </div>
            ) : null}

            <Link
              href={isUnauthorized ? '/login' : '/'}
              className="primary-link"
            >
              {isUnauthorized ? 'Sign in' : 'Back to dashboard'}
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M4 10h12M11.5 5.5 16 10l-4.5 4.5" />
              </svg>
            </Link>
          </div>
        </section>
      </Layout>
    </>
  )
}
