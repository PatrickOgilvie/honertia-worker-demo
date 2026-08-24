import type { BetterAuthOptions } from 'better-auth'
import { sql } from 'drizzle-orm'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import type { Database } from '~/db/db'
import { rateLimits } from '~/db/schema'

type RateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions['rateLimit']>['customStorage']
>

interface StoredRateLimit {
  readonly key: string
  readonly count: number
  readonly lastRequest: number
}

const MAX_CONSUME_ATTEMPTS = 3

function assertValidRule(rule: {
  readonly window: number
  readonly max: number
}): void {
  const windowInMs = rule.window * 1_000

  if (
    !Number.isFinite(windowInMs) ||
    windowInMs <= 0 ||
    !Number.isSafeInteger(rule.max) ||
    rule.max < 1
  ) {
    throw new Error('Invalid Better Auth rate-limit rule')
  }
}

/**
 * Creates Better Auth storage whose request path touches one counter key only.
 * The single UPSERT both decides and records an allowed request, closing the
 * concurrent read-then-write gap without invoking provider-wide cleanup.
 */
export function makeSqliteRateLimitStorage<
  TResultKind extends 'sync' | 'async',
  TRunResult,
  TSchema extends Record<string, unknown>,
>(
  database: BaseSQLiteDatabase<TResultKind, TRunResult, TSchema>
): RateLimitStorage {
  const read = async (key: string): Promise<StoredRateLimit | null> => {
    const row = await database.get<StoredRateLimit>(sql`
      SELECT
        ${rateLimits.key} AS key,
        ${rateLimits.count} AS count,
        ${rateLimits.lastRequest} AS lastRequest
      FROM ${rateLimits}
      WHERE ${rateLimits.key} = ${key}
      LIMIT 1
    `)

    return row ?? null
  }

  return {
    get: read,
    set: async (key, value, update) => {
      if (update) {
        await database.run(sql`
          UPDATE ${rateLimits}
          SET
            count = ${value.count},
            last_request = ${value.lastRequest}
          WHERE ${rateLimits.key} = ${key}
        `)
        return
      }

      await database.run(sql`
        INSERT INTO ${rateLimits} (id, key, count, last_request)
        VALUES (
          ${crypto.randomUUID()},
          ${key},
          ${value.count},
          ${value.lastRequest}
        )
        ON CONFLICT (key) DO UPDATE SET
          count = excluded.count,
          last_request = excluded.last_request
      `)
    },
    consume: async (key, rule) => {
      assertValidRule(rule)
      const windowInMs = rule.window * 1_000

      for (let attempt = 0; attempt < MAX_CONSUME_ATTEMPTS; attempt += 1) {
        const now = Date.now()
        const consumed = await database.get<StoredRateLimit>(sql`
          INSERT INTO ${rateLimits} (id, key, count, last_request)
          VALUES (${crypto.randomUUID()}, ${key}, 1, ${now})
          ON CONFLICT (key) DO UPDATE SET
            count = CASE
              WHEN ${now} - ${rateLimits.lastRequest} > ${windowInMs} THEN 1
              ELSE ${rateLimits.count} + 1
            END,
            last_request = ${now}
          WHERE
            ${now} - ${rateLimits.lastRequest} > ${windowInMs}
            OR ${rateLimits.count} < ${rule.max}
          RETURNING
            ${rateLimits.key} AS key,
            ${rateLimits.count} AS count,
            ${rateLimits.lastRequest} AS lastRequest
        `)

        if (consumed) {
          return { allowed: true, retryAfter: null }
        }

        const current = await read(key)
        const observedAt = Date.now()
        if (
          current &&
          observedAt - current.lastRequest <= windowInMs &&
          current.count >= rule.max
        ) {
          return {
            allowed: false,
            retryAfter: Math.max(
              0,
              Math.ceil(
                (current.lastRequest + windowInMs - observedAt) / 1_000
              )
            ),
          }
        }
      }

      // A scheduled cleanup can race only with counters older than 24 hours,
      // but fail closed if an unexpected writer keeps replacing this key.
      return { allowed: false, retryAfter: 1 }
    },
  }
}

/** Creates the production D1-backed Better Auth rate-limit storage. */
export function makeD1RateLimitStorage(database: Database): RateLimitStorage {
  return makeSqliteRateLimitStorage(database)
}
