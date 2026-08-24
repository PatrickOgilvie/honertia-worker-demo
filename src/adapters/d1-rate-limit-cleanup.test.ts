import { describe, expect, test } from 'bun:test'
import { Database as BunDatabase } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import {
  deleteExpiredRateLimitRows,
  RATE_LIMIT_CLEANUP_BATCH_SIZE,
  RATE_LIMIT_RETENTION_MS,
} from '~/adapters/d1-rate-limit-cleanup'
import * as schema from '~/db/schema'

describe('D1 rate-limit cleanup', () => {
  test('drains never-reused stale keys in fixed oldest-first batches', async () => {
    const sqlite = new BunDatabase(':memory:')
    try {
      sqlite.exec(
        'CREATE TABLE rate_limits (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, last_request INTEGER NOT NULL)'
      )
      sqlite.exec(
        'CREATE INDEX idx_rate_limits_last_request ON rate_limits(last_request, id)'
      )
      const insert = sqlite.prepare(
        'INSERT INTO rate_limits (id, key, count, last_request) VALUES (?, ?, ?, ?)'
      )
      const now = 2_000_000_000_000
      const staleCount = RATE_LIMIT_CLEANUP_BATCH_SIZE + 37

      for (let index = 0; index < staleCount; index += 1) {
        insert.run(
          `stale-${index}`,
          `one-shot-ip-${index}:/sign-in/email`,
          1,
          now - RATE_LIMIT_RETENTION_MS - index - 1
        )
      }
      insert.run('fresh', 'fresh:/sign-in/email', 1, now)

      const queryPlan = sqlite
        .query(
          'EXPLAIN QUERY PLAN SELECT id FROM rate_limits WHERE last_request < ? ORDER BY last_request ASC, id ASC LIMIT ?'
        )
        .all(now - RATE_LIMIT_RETENTION_MS, RATE_LIMIT_CLEANUP_BATCH_SIZE)
      expect(
        queryPlan.some(
          (step) =>
            typeof step === 'object' &&
            step !== null &&
            'detail' in step &&
            String(step.detail).includes('TEMP B-TREE')
        )
      ).toBe(false)

      const database = drizzle(sqlite, { schema })
      await deleteExpiredRateLimitRows(database, now)

      expect(
        sqlite
          .query('SELECT COUNT(*) AS count FROM rate_limits')
          .get()
      ).toEqual({ count: 38 })
      expect(
        sqlite
          .query("SELECT COUNT(*) AS count FROM rate_limits WHERE id = 'fresh'")
          .get()
      ).toEqual({ count: 1 })
      expect(
        sqlite
          .query(
            "SELECT MIN(last_request) AS oldest, MAX(last_request) AS newest FROM rate_limits WHERE id <> 'fresh'"
          )
          .get()
      ).toEqual({
        oldest: now - RATE_LIMIT_RETENTION_MS - 37,
        newest: now - RATE_LIMIT_RETENTION_MS - 1,
      })

      await deleteExpiredRateLimitRows(database, now)
      expect(
        sqlite
          .query('SELECT id FROM rate_limits ORDER BY id')
          .all()
      ).toEqual([{ id: 'fresh' }])
    } finally {
      sqlite.close()
    }
  })
})
