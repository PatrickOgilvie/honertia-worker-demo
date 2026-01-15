import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Database } from '../db/db'
import * as schema from '../db/schema'

export interface AuthConfig {
  db: Database
  secret: string
  baseURL: string
  trustedOrigins?: string
}

export function createAuth(config: AuthConfig) {
  // Extract root domain for cross-subdomain cookies
  // e.g., "4000-project-xxx.localhost" -> ".localhost"
  const url = new URL(config.baseURL)
  const hostParts = url.hostname.split('.')
  // Only enable cross-subdomain cookies when there's a subdomain
  const rootDomain = hostParts.length > 1
    ? `.${hostParts.slice(-1)[0]}`
    : null
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
    trustedOrigins: config.trustedOrigins
      ? config.trustedOrigins.split(',')
      : [],
    baseURL: config.baseURL,
    emailAndPassword: {
      enabled: true,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
    ...(rootDomain && {
      advanced: {
        crossSubDomainCookies: {
          enabled: true,
          domain: rootDomain,
        },
      },
    }),
  })
}

export type Auth = ReturnType<typeof createAuth>
