import { sql } from 'drizzle-orm'
import { check, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// Better-auth tables
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).default(false),
  name: text('name'),
  image: text('image'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
  },
  (table) => [
    index('idx_sessions_owner_created_id').on(
      table.userId,
      sql`${table.createdAt} DESC`,
      sql`${table.id} DESC`
    ),
  ]
)

export const accounts = sqliteTable('accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
  refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const verifications = sqliteTable('verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
})

export const rateLimits = sqliteTable(
  'rate_limits',
  {
    id: text('id').primaryKey(),
    key: text('key').notNull().unique(),
    count: integer('count').notNull(),
    lastRequest: integer('last_request').notNull(),
  },
  (table) => [
    index('idx_rate_limits_last_request').on(
      table.lastRequest,
      table.id
    ),
  ]
)

// Application tables
export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    visibility: text('visibility', { enum: ['private', 'public'] })
      .notNull()
      .default('private'),
    revision: integer('revision').notNull().default(1),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (table) => [
    index('idx_projects_user_id').on(table.userId),
    index('idx_projects_updated_at').on(table.updatedAt),
    index('idx_projects_owner_active_order').on(
      table.userId,
      table.deletedAt,
      sql`${table.updatedAt} DESC`,
      sql`${table.id} DESC`
    ),
    check('projects_name_length', sql`length(${table.name}) BETWEEN 1 AND 100`),
    check(
      'projects_description_length',
      sql`length(${table.description}) <= 500`
    ),
    check(
      'projects_visibility',
      sql`${table.visibility} IN ('private', 'public')`
    ),
    check(
      'projects_revision',
      sql`${table.revision} BETWEEN 1 AND 9007199254740991`
    ),
    check(
      'projects_retired_state',
      sql`${table.deletedAt} IS NULL OR (${table.visibility} = 'private' AND ${table.name} = '(deleted)' AND ${table.description} = '')`
    ),
  ]
)

export type User = typeof users.$inferSelect
