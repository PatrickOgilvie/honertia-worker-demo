import type { PageProps as InertiaPageProps } from '@inertiajs/react'


import type { Database } from '~/db/db'
import type { auth } from '~/lib/auth'
declare module 'honertia/effect' {
  interface HonertiaDatabaseType {
    type: Database
  }
  interface HonertiaAuthType {
    type: typeof auth
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

export type PageProps<T = Record<string, unknown>> = InertiaPageProps<T & SharedProps>
