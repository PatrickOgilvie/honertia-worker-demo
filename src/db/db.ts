import { drizzle, type DrizzleD1Database } from 'drizzle-orm/d1'
import * as schema from '~/db/schema'

export function createDb(d1: D1Database) {
  return drizzle(d1, { schema })
}

export type Database = DrizzleD1Database<typeof schema>