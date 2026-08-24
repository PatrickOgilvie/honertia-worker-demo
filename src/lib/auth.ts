import type { AuthBackgroundTasks } from '@popcomputer/web'
import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { Redacted } from 'effect'

import type { Database } from '../db/db'
import * as schema from '../db/schema'
import type { AuthSecret } from '~/domain/auth-credentials'
import type { DeploymentMode } from '~/runtime/runtime-config'
import { makeD1RateLimitStorage } from '~/adapters/d1-rate-limit-storage'

/** Closed diagnostic emitted in place of Better Auth's value-bearing logs. */
export interface SafeBetterAuthLogEvent {
  readonly source: 'better-auth'
  readonly level: 'debug' | 'info' | 'warn' | 'error'
}

/** Creates a logger that discards provider messages, arguments, and SQL values. */
export function makeSafeBetterAuthLogger(
  write: (event: SafeBetterAuthLogEvent) => void = (event) => {
    console.error('@popcomputer/web:better-auth', event)
  }
): NonNullable<BetterAuthOptions['logger']> {
  return {
    disableColors: true,
    level: 'warn',
    log: (level) => write({ source: 'better-auth', level }),
  }
}

/** Configuration for the request-scoped Better Auth server. */
export interface AuthConfig {
  readonly db: Database
  readonly secret: AuthSecret
  readonly baseURL: URL
  readonly trustedOrigins: ReadonlyArray<URL>
  readonly backgroundTasks: AuthBackgroundTasks
  readonly mode: DeploymentMode
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
    secret: Redacted.value(config.secret),
    baseURL: config.baseURL.origin,
    trustedOrigins: config.trustedOrigins.map((origin) => origin.origin),
    logger: makeSafeBetterAuthLogger(),
    rateLimit: {
      enabled: config.mode === 'production',
      customStorage: makeD1RateLimitStorage(config.db),
    },
    advanced: {
      backgroundTasks: config.backgroundTasks,
      ipAddress: {
        ipAddressHeaders: ['cf-connecting-ip'],
      },
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
