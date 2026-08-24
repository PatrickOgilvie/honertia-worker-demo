import type { PageProps as InertiaPageProps } from '@inertiajs/core'
import { Schema as S } from 'effect'

import type { Database } from '~/db/db'
import type { Auth } from '~/lib/auth'
import * as schema from '~/db/schema'
import type { projectRouteBindings } from '~/domain/project'
import { SessionId, UserId } from '~/domain/identity'
import { SessionToken } from '~/domain/auth-credentials'
import type {
  RuntimeConfig,
  RuntimeConfigBindings,
} from '~/runtime/runtime-config'

// Hono app environment types
export type Bindings = RuntimeConfigBindings & { readonly DB: D1Database }

export type AppEnv = {
  readonly Bindings: Bindings
  readonly Variables: { readonly runtimeConfig: RuntimeConfig }
}

/** Runtime schema for the Better Auth session supplied to authenticated effects. */
export const AuthUser = S.Struct({
  user: S.Struct({
    id: UserId,
    name: S.NullOr(S.String),
    email: S.String,
    emailVerified: S.Boolean,
    image: S.NullOr(S.String),
    createdAt: S.Date,
    updatedAt: S.Date,
  }),
  session: S.Struct({
    id: SessionId,
    userId: UserId,
    expiresAt: S.Date,
    token: SessionToken,
    createdAt: S.Date,
    updatedAt: S.Date,
    ipAddress: S.optionalKey(S.NullOr(S.String)),
    userAgent: S.optionalKey(S.NullOr(S.String)),
  }),
}).check(
  S.makeFilter((authUser) =>
    authUser.user.id === authUser.session.userId
      ? undefined
      : 'Authenticated session owner does not match the user.'
  )
)

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
  interface WebRouteBindingsType {
    type: typeof projectRouteBindings
  }
}

export interface SharedProps {
  auth: {
    user: Pick<AuthUser['user'], 'id' | 'name' | 'email'> | null
  }
  errors?: Record<string, string>
}

export type PageProps<T = Record<string, unknown>> = InertiaPageProps & T & SharedProps
