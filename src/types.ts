import type { PageProps as InertiaPageProps } from '@inertiajs/core'
import { Schema as S } from 'effect'

import type { Database } from '~/db/db'
import type { Auth } from '~/lib/auth'
import * as schema from '~/db/schema'

// Hono app environment types
export type Bindings = {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  BETTER_AUTH_TRUSTED_ORIGINS?: string
  ENVIRONMENT?: string
}

export type AppEnv = { Bindings: Bindings }

/** Runtime schema for the Better Auth session supplied to authenticated effects. */
export const AuthUser = S.Struct({
  user: S.Struct({
    id: S.String,
    name: S.NullOr(S.String),
    email: S.String,
    emailVerified: S.Boolean,
    image: S.NullOr(S.String),
    createdAt: S.Date,
    updatedAt: S.Date,
  }),
  session: S.Struct({
    id: S.String,
    userId: S.String,
    expiresAt: S.Date,
    token: S.String,
    createdAt: S.Date,
    updatedAt: S.Date,
    ipAddress: S.optionalKey(S.NullOr(S.String)),
    userAgent: S.optionalKey(S.NullOr(S.String)),
  }),
})

/** Parsed Better Auth session used by the application. */
export interface AuthUser extends S.Schema.Type<typeof AuthUser> {}

declare module '@popcomputer/web/effect' {
  interface WebDatabaseType {
    type: Database
    schema: typeof schema
  }
  interface WebAuthType {
    type: Auth
  }
  interface WebBindingsType {
    type: Bindings
  }
  interface WebAuthUserType {
    type: AuthUser
  }
}

export interface SharedProps {
  auth: {
    user: Pick<AuthUser['user'], 'id' | 'name' | 'email'> | null
  }
  errors?: Record<string, string>
}

export type PageProps<T = Record<string, unknown>> = InertiaPageProps & T & SharedProps
