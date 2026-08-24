import { describe, expect, test } from 'bun:test'
import { Effect } from 'effect'

import {
  ensureRequestActive,
  isRequestCancellationRequested,
  makeRequestCancellationLayer,
} from '~/runtime/request-cancellation'

describe('request cancellation', () => {
  test('is optional and adds no static service requirement', async () => {
    const cancelled = await Effect.runPromise(
      isRequestCancellationRequested()
    )

    expect(cancelled).toBe(false)
  })

  test('observes the ambient request signal', async () => {
    const controller = new AbortController()
    controller.abort('private-abort-reason')

    const error = await Effect.runPromise(
      Effect.flip(
        ensureRequestActive({}, () => ({
          _tag: 'SafeCancellation',
          operation: 'read',
        }))
      ).pipe(Effect.provide(makeRequestCancellationLayer(controller.signal)))
    )

    expect(error).toEqual({
      _tag: 'SafeCancellation',
      operation: 'read',
    })
    expect(JSON.stringify(error)).not.toContain('private-abort-reason')
  })

  test('observes an explicit signal alongside an ambient signal', async () => {
    const ambient = new AbortController()
    const explicit = new AbortController()
    explicit.abort()

    const cancelled = await Effect.runPromise(
      isRequestCancellationRequested({ signal: explicit.signal }).pipe(
        Effect.provide(makeRequestCancellationLayer(ambient.signal))
      )
    )

    expect(cancelled).toBe(true)
  })
})
