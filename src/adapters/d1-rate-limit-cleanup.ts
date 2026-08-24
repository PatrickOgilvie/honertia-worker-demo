import { sql, type SQL } from 'drizzle-orm'

import { rateLimits } from '~/db/schema'

/** Number of oldest expired rate-limit rows removed by one cleanup tick. */
export const RATE_LIMIT_CLEANUP_BATCH_SIZE = 500

/** Retention comfortably beyond Better Auth's longest configured window. */
export const RATE_LIMIT_RETENTION_MS = 24 * 60 * 60 * 1000

interface SqlRunner {
  readonly run: (query: SQL) => unknown
}

/**
 * Deletes one deterministic, indexed batch of stale one-shot rate-limit keys.
 * Repeated cron ticks drain a backlog without one unbounded D1 mutation.
 */
export async function deleteExpiredRateLimitRows(
  database: SqlRunner,
  now = Date.now()
): Promise<void> {
  const cutoff = now - RATE_LIMIT_RETENTION_MS

  await Promise.resolve(
    database.run(sql`
      DELETE FROM ${rateLimits}
      WHERE ${rateLimits.id} IN (
        SELECT ${rateLimits.id}
        FROM ${rateLimits}
        WHERE ${rateLimits.lastRequest} < ${cutoff}
        ORDER BY ${rateLimits.lastRequest} ASC, ${rateLimits.id} ASC
        LIMIT ${RATE_LIMIT_CLEANUP_BATCH_SIZE}
      )
    `)
  )
}
