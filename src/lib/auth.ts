import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { Database } from '../db/db'
import * as schema from '../db/schema'

export interface AuthConfig {
  db: Database
  secret: string
  baseURL: string
  trustedOrigins?: string
  environment?: string
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
    baseURL: config.baseURL,
    trustedOrigins: config.trustedOrigins
      ? config.trustedOrigins.split(',')
      : [],
    emailAndPassword: {
      enabled: true,
    }
  })
}

export type Auth = ReturnType<typeof createAuth>
