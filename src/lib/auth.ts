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
    baseURL: config.trustedOrigins,
    emailAndPassword: {
      enabled: true,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
