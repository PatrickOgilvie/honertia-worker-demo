import { Head, useForm, usePage } from '@inertiajs/react'
import { useState } from 'react'

import type { SessionSummary } from '~/presentation/session'
import ConfirmationDialog from '~/components/ConfirmationDialog'
import Layout from '~/components/Layout'
import type { PageProps } from '~/types'

type SessionsPageProps = PageProps<{
  readonly sessions: ReadonlyArray<SessionSummary>
}>

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function formatDateTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : dateTimeFormatter.format(date)
}

function describeDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device'
  if (/iPad|iPhone|iPod/.test(userAgent)) return 'Apple mobile device'
  if (/Android/.test(userAgent)) return 'Android device'
  if (/Macintosh|Mac OS X/.test(userAgent)) return 'Mac'
  if (/Windows/.test(userAgent)) return 'Windows device'
  if (/Linux/.test(userAgent)) return 'Linux device'
  return 'Web browser'
}

function SessionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  )
}

function SessionCard({ session }: { readonly session: SessionSummary }) {
  const {
    post,
    processing,
    errors: revokeErrors,
    clearErrors,
  } = useForm({ sessionId: session.id })
  const [confirmsRevoke, setConfirmsRevoke] = useState(false)
  const device = describeDevice(session.userAgent)

  function handleRevoke() {
    post('/sessions/revoke', {
      preserveScroll: true,
      onSuccess: () => setConfirmsRevoke(false),
    })
  }

  function openRevokeDialog() {
    clearErrors()
    setConfirmsRevoke(true)
  }

  return (
    <li className="session-card">
      <div className="session-icon">
        <SessionIcon />
      </div>
      <div className="session-details">
        <div className="session-title-row">
          <h2>{device}</h2>
          {session.isCurrent ? (
            <span className="current-session-badge">
              <span aria-hidden="true" />
              This device
            </span>
          ) : null}
        </div>
        <dl className="session-meta">
          <div>
            <dt>Last active</dt>
            <dd>
              <time dateTime={session.updatedAt}>
                {formatDateTime(session.updatedAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>IP address</dt>
            <dd>{session.ipAddress ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              <time dateTime={session.createdAt}>
                {formatDateTime(session.createdAt)}
              </time>
            </dd>
          </div>
          <div>
            <dt>Expires</dt>
            <dd>
              <time dateTime={session.expiresAt}>
                {formatDateTime(session.expiresAt)}
              </time>
            </dd>
          </div>
        </dl>
      </div>

      {!session.isCurrent ? (
        <button
          type="button"
          className="danger-outline-button session-revoke-button"
          disabled={processing}
          aria-label={`Revoke ${device} session last active ${formatDateTime(session.updatedAt)}`}
          onClick={openRevokeDialog}
        >
          Revoke
        </button>
      ) : null}

      <ConfirmationDialog
        open={confirmsRevoke}
        title="Revoke this session?"
        description={`This will sign ${device.toLowerCase()} out of your account. You can sign in again later.`}
        confirmLabel="Revoke session"
        busyLabel="Revoking…"
        busy={processing}
        error={confirmsRevoke ? revokeErrors.sessionId : undefined}
        onCancel={() => setConfirmsRevoke(false)}
        onConfirm={handleRevoke}
      />
    </li>
  )
}

/** Presents active sessions and server-owned revocation controls. */
export default function SessionsIndex() {
  const { sessions, errors } = usePage<SessionsPageProps>().props
  const otherSessionCount = sessions.filter((session) => !session.isCurrent).length
  const { post, processing } = useForm({})
  const [confirmsRevokeOthers, setConfirmsRevokeOthers] = useState(false)

  function handleRevokeOthers() {
    post('/sessions/revoke-others', {
      preserveScroll: true,
      onSuccess: () => setConfirmsRevokeOthers(false),
    })
  }

  return (
    <>
      <Head title="Active sessions">
        <meta name="theme-color" content="#f5f3ee" />
      </Head>
      <Layout breadcrumbs={[{ label: 'Sessions' }]}>
        <div className="sessions-page">
          <section className="sessions-panel" aria-labelledby="sessions-title">
            <header className="sessions-header">
              <div className="page-heading">
                <p className="eyebrow">Effect-native Better Auth</p>
                <h1 id="sessions-title">Active sessions</h1>
                <p>
                  Review signed-in devices and revoke access without exposing
                  authentication tokens to the browser.
                </p>
              </div>
              <button
                type="button"
                disabled={processing || otherSessionCount === 0}
                className="dark-button"
                onClick={() => setConfirmsRevokeOthers(true)}
              >
                {otherSessionCount === 0
                  ? 'No other sessions'
                  : `Revoke ${otherSessionCount === 1 ? 'other session' : 'other sessions'}`}
              </button>
            </header>

            <div className="sessions-list-shell">
              {errors?.sessionId ? (
                <p className="field-error session-error" role="alert">
                  {errors.sessionId}
                </p>
              ) : null}
              <div className="sessions-summary">
                <p>
                  {sessions.length} active{' '}
                  {sessions.length === 1 ? 'session' : 'sessions'}
                </p>
                <span>Tokens stay server-side</span>
              </div>
              {sessions.length > 0 ? (
                <ul className="sessions-list" aria-label="Active sessions">
                  {sessions.map((session) => (
                    <SessionCard key={session.id} session={session} />
                  ))}
                </ul>
              ) : (
                <p className="sessions-empty">No active sessions were returned.</p>
              )}
            </div>
          </section>
        </div>
      </Layout>

      <ConfirmationDialog
        open={confirmsRevokeOthers}
        title={
          otherSessionCount === 1
            ? 'Revoke the other session?'
            : 'Revoke other sessions?'
        }
        description={`This will sign out ${otherSessionCount} ${otherSessionCount === 1 ? 'other device' : 'other devices'}. Your current session will stay active.`}
        confirmLabel={
          otherSessionCount === 1
            ? 'Revoke other session'
            : 'Revoke other sessions'
        }
        busyLabel="Revoking…"
        busy={processing}
        onCancel={() => setConfirmsRevokeOthers(false)}
        onConfirm={handleRevokeOthers}
      />
    </>
  )
}
