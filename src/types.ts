import type { PageProps as InertiaPageProps } from '@inertiajs/core'

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

export type Variables = {
  db: Database
  auth: Auth
}

export type AppEnv = { Bindings: Bindings; Variables: Variables }

declare module 'honertia/effect' {
  interface HonertiaDatabaseType {
    type: Database
    schema: typeof schema
  }
  interface HonertiaAuthType {
    type: Auth
  }
  interface HonertiaBindingsType {
    type: Bindings
  }
}

export interface AuthUser {
  user: {
    id: string
    name: string | null
    email: string
    emailVerified: boolean
    image: string | null
    createdAt: Date
    updatedAt: Date
  }
  session: {
    id: string
    userId: string
    expiresAt: Date
    token: string
    createdAt: Date
    updatedAt: Date
    ipAddress: string | null
    userAgent: string | null
  }
}

export interface SharedProps {
  auth: AuthUser | null
  errors?: Record<string, string>
}

export type PageProps<T = Record<string, unknown>> = InertiaPageProps & T & SharedProps
