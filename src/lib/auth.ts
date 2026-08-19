import type { AuthBackgroundTasks } from '@popcomputer/web'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Database } from '../db/db'
import * as schema from '../db/schema'

/** Configuration for the request-scoped Better Auth server. */
export interface AuthConfig {
  readonly db: Database
  readonly secret: string
  readonly baseURL: string
  readonly trustedOrigins?: string
  readonly environment?: string
  readonly backgroundTasks: AuthBackgroundTasks
}

/** Creates a Better Auth server backed by the request's D1 database. */
export function createAuth(config: AuthConfig) {
  return betterAuth({
    database: drizzleAdapter(config.db, {
      provider: 'sqlite',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    secret: config.secret,
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins
      ? config.trustedOrigins.split(',')
      : [],
    advanced: {
      backgroundTasks: config.backgroundTasks,
    },
    // The demo has no reauthentication flow, so session management stays usable
    // for the lifetime of an otherwise valid login.
    session: {
      freshAge: 0,
    },
    emailAndPassword: {
      enabled: true,
    },
  })
}

/** Better Auth server type produced by {@link createAuth}. */
export type Auth = ReturnType<typeof createAuth>
