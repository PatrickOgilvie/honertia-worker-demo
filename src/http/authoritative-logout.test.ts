import { describe, expect, test } from 'bun:test'
import { Effect, Exit } from 'effect'

import { revokeBeforeClearingCredentials } from '~/http/authoritative-logout'

describe('authoritative logout policy', () => {
  test('clears credentials only after revocation succeeds', async () => {
    const events: Array<string> = []
    const response = await Effect.runPromise(
      revokeBeforeClearingCredentials(
        Effect.sync(() => events.push('revoke')),
        Effect.sync(() => {
          events.push('clear')
          return new Response(null, { status: 303 })
        })
      )
    )

    expect(response.status).toBe(303)
    expect(events).toEqual(['revoke', 'clear'])
  })

  test('retains credentials when authoritative revocation fails', async () => {
    const events: Array<string> = []
    const exit = await Effect.runPromiseExit(
      revokeBeforeClearingCredentials(
        Effect.fail('provider-unavailable'),
        Effect.sync(() => {
          events.push('clear')
          return new Response(null, { status: 303 })
        })
      )
    )

    expect(Exit.isFailure(exit)).toBe(true)
    expect(events).toEqual([])
  })
})
