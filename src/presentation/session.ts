import { Schema as S } from 'effect'

import { SessionId } from '~/domain/identity'
import type { ManagedSession } from '~/domain/session'
import { IsoTimestamp } from '~/presentation/timestamp'

/** Token-free session information safe to expose to the browser. */
export const SessionSummary = S.Struct({
  id: SessionId,
  createdAt: IsoTimestamp,
  updatedAt: IsoTimestamp,
  expiresAt: IsoTimestamp,
  ipAddress: S.NullOr(S.String),
  userAgent: S.NullOr(S.String),
  isCurrent: S.Boolean,
}).annotate({ identifier: 'SessionSummary' })

/** Token-free session information safe to expose to the browser. */
export interface SessionSummary extends S.Schema.Type<typeof SessionSummary> {}

/** Browser-safe props for the active-sessions page. */
export const SessionIndexProps = S.Struct({
  sessions: S.Array(SessionSummary),
}).annotate({ identifier: 'SessionIndexProps' })

/** Browser-safe props for the active-sessions page. */
export interface SessionIndexProps
  extends S.Schema.Type<typeof SessionIndexProps> {}

/** Projects a managed session into the browser protocol. */
export function toSessionSummary(session: ManagedSession): SessionSummary {
  return {
    id: session.id,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    isCurrent: session.isCurrent,
  }
}
