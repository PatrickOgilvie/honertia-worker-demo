import { describe, expect, test } from 'bun:test'
import { Database as BunDatabase } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'

import { makeSqliteRateLimitStorage } from '~/adapters/d1-rate-limit-storage'
import * as schema from '~/db/schema'

function createDatabase() {
  const sqlite = new BunDatabase(':memory:')
  sqlite.exec(
    'CREATE TABLE rate_limits (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, count INTEGER NOT NULL, last_request INTEGER NOT NULL)'
  )

  return {
    sqlite,
    database: drizzle(sqlite, { schema }),
  }
}

describe('D1 rate-limit storage', () => {
  test('resets only the requested stale key', async () => {
    const { sqlite, database } = createDatabase()
    try {
      const staleAt = Date.now() - 60_000
      const insert = sqlite.prepare(
        'INSERT INTO rate_limits (id, key, count, last_request) VALUES (?, ?, ?, ?)'
      )
      insert.run('target-id', 'target', 3, staleAt)
      insert.run('other-a-id', 'other-a', 1, staleAt - 1)
      insert.run('other-b-id', 'other-b', 2, staleAt - 2)

      const storage = makeSqliteRateLimitStorage(database)
      await expect(
        storage.consume?.('target', { window: 10, max: 3 })
      ).resolves.toEqual({ allowed: true, retryAfter: null })

      expect(
        sqlite
          .query(
            'SELECT key, count, last_request AS lastRequest FROM rate_limits ORDER BY key'
          )
          .all()
      ).toEqual([
        { key: 'other-a', count: 1, lastRequest: staleAt - 1 },
        { key: 'other-b', count: 2, lastRequest: staleAt - 2 },
        {
          key: 'target',
          count: 1,
          lastRequest: expect.any(Number),
        },
      ])
    } finally {
      sqlite.close()
    }
  })

  test('atomically enforces the maximum across concurrent consumers', async () => {
    const { sqlite, database } = createDatabase()
    try {
      const storage = makeSqliteRateLimitStorage(database)
      const consume = storage.consume
      expect(consume).toBeDefined()
      if (!consume) return

      const decisions = await Promise.all(
        Array.from({ length: 8 }, () =>
          consume('shared', { window: 10, max: 3 })
        )
      )

      expect(decisions.filter((decision) => decision.allowed)).toHaveLength(3)
      expect(decisions.filter((decision) => !decision.allowed)).toHaveLength(5)
      expect(
        sqlite
          .query(
            "SELECT count FROM rate_limits WHERE key = 'shared' LIMIT 1"
          )
          .get()
      ).toEqual({ count: 3 })
    } finally {
      sqlite.close()
    }
  })
})
