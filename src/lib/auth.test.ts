import { describe, expect, test } from 'bun:test'

import { makeSafeBetterAuthLogger } from '~/lib/auth'

describe('Better Auth configuration', () => {
  test('discards provider messages and arguments at the logging boundary', () => {
    const events: Array<unknown> = []
    const logger = makeSafeBetterAuthLogger((event) => events.push(event))

    logger.log?.(
      'error',
      'query failed with session-token-sentinel',
      { token: 'session-token-sentinel', sql: 'private query' }
    )

    expect(events).toEqual([{ source: 'better-auth', level: 'error' }])
    expect(JSON.stringify(events)).not.toContain('session-token-sentinel')
    expect(JSON.stringify(events)).not.toContain('private query')
  })
})
