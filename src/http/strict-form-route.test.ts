import { describe, expect, test } from 'bun:test'
import { Effect, Schema as S } from 'effect'

import { HttpError } from '@popcomputer/web/effect'
import { makeRawRequestLayer } from '~/http/bounded-request-body'
import { defineStrictForm } from '~/http/strict-form-route'

function formRequest(
  body: Record<string, string>,
  onRead: () => void,
  signal?: AbortSignal
) {
  const encoded = new TextEncoder().encode(
    new URLSearchParams(body).toString()
  )
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        onRead()
        controller.enqueue(encoded)
        controller.close()
      },
    },
    { highWaterMark: 0 }
  )
  const init: RequestInit & { readonly duplex: 'half' } = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: stream,
    duplex: 'half',
    signal,
  }
  return new Request('https://example.test/projects', init)
}

describe('strict form route', () => {
  test('prepares context before parsing the body exactly once', async () => {
    const events: Array<string> = []
    const form = defineStrictForm({
      name: 'StrictForm.testValid',
      schema: S.Struct({ name: S.String }),
      prepare: Effect.sync(() => {
        events.push('prepare')
        return 'prepared'
      }),
      onInvalid: () => Effect.succeed(new Response('invalid', { status: 422 })),
      onValid: (input, prepared) =>
        Effect.sync(() => {
          events.push(`valid:${prepared}:${input.name}`)
          return new Response('valid')
        }),
    })

    const response = await Effect.runPromise(
      form.handler.pipe(
        Effect.provide(
          makeRawRequestLayer(
            formRequest({ name: 'Ada' }, () => events.push('parse'))
          )
        )
      )
    )

    expect(response).toBeInstanceOf(Response)
    if (!(response instanceof Response)) {
      throw new Error('Expected a Response from the test form.')
    }
    expect(await response.text()).toBe('valid')
    expect(events).toEqual(['prepare', 'parse', 'valid:prepared:Ada'])
  })

  test('rejects undeclared fields without exposing the rejected input', async () => {
    let parseCount = 0
    let validCalled = false
    const form = defineStrictForm({
      name: 'StrictForm.testInvalid',
      schema: S.Struct({ name: S.String }),
      prepare: Effect.succeed({ safeContext: 'project-form' }),
      onInvalid: (errors, prepared) =>
        Effect.succeed(
          Response.json({ errors, prepared }, { status: 422 })
        ),
      onValid: () => {
        validCalled = true
        return Effect.succeed(new Response('valid'))
      },
    })

    const response = await Effect.runPromise(
      form.handler.pipe(
        Effect.provide(
          makeRawRequestLayer(
            formRequest(
            { name: 'Ada', userId: 'attacker-controlled-owner' },
            () => {
              parseCount += 1
            }
          )
          )
        )
      )
    )
    if (!(response instanceof Response)) {
      throw new Error('Expected a Response from the test form.')
    }
    const payload = await Effect.runPromise(
      S.decodeUnknownEffect(
        S.Struct({
          errors: S.Unknown,
          prepared: S.Struct({ safeContext: S.String }),
        })
      )(await response.json())
    )

    expect(parseCount).toBe(1)
    expect(validCalled).toBe(false)
    expect(payload.prepared).toEqual({ safeContext: 'project-form' })
    expect(payload.errors).toBeObject()
    expect(JSON.stringify(payload)).not.toContain('attacker-controlled-owner')
  })

  test('does not read a chunked body when preparation denies access', async () => {
    let bodyReads = 0
    const form = defineStrictForm({
      name: 'StrictForm.testDenied',
      schema: S.Struct({ name: S.String }),
      prepare: Effect.fail(
        new HttpError({ status: 404, message: 'Not found.' })
      ),
      onInvalid: () => Effect.succeed(new Response('invalid')),
      onValid: () => Effect.succeed(new Response('valid')),
    })

    const failure = await Effect.runPromise(
      form.handler.pipe(
        Effect.provide(
          makeRawRequestLayer(
            formRequest({ name: 'Never read' }, () => {
              bodyReads += 1
            })
          )
        ),
        Effect.flip
      )
    )

    expect(failure).toBeInstanceOf(HttpError)
    expect(bodyReads).toBe(0)
  })

  test('bounds a chunked body after preparation and before validation', async () => {
    const events: Array<string> = []
    const form = defineStrictForm({
      name: 'StrictForm.testBounded',
      schema: S.Struct({ name: S.String }),
      prepare: Effect.sync(() => {
        events.push('prepare')
        return undefined
      }),
      onInvalid: () => Effect.succeed(new Response('invalid')),
      onValid: () => Effect.succeed(new Response('valid')),
    })

    const failure = await Effect.runPromise(
      form.handler.pipe(
        Effect.provide(
          makeRawRequestLayer(
            formRequest({ name: 'x'.repeat(9_000) }, () => {
              events.push('read')
            })
          )
        ),
        Effect.flip
      )
    )

    expect(failure).toBeInstanceOf(HttpError)
    if (!(failure instanceof HttpError)) {
      throw new Error('Expected a bounded-body HTTP error.')
    }
    expect(failure.status).toBe(413)
    expect(events).toEqual(['prepare', 'read'])
  })

  test('classifies an aborted upload as cancellation without leaking its reason', async () => {
    const controller = new AbortController()
    let bodyReads = 0
    const form = defineStrictForm({
      name: 'StrictForm.testCancelled',
      schema: S.Struct({ name: S.String }),
      prepare: Effect.succeed(undefined),
      onInvalid: () => Effect.succeed(new Response('invalid')),
      onValid: () => Effect.succeed(new Response('valid')),
    })

    const failure = await Effect.runPromise(
      form.handler.pipe(
        Effect.provide(
          makeRawRequestLayer(
            formRequest(
              { name: 'interrupted' },
              () => {
                bodyReads += 1
                controller.abort('private-upload-reason')
              },
              controller.signal
            )
          )
        ),
        Effect.flip
      )
    )

    expect(failure).toBeInstanceOf(HttpError)
    if (!(failure instanceof HttpError)) {
      throw new Error('Expected a cancelled-body HTTP error.')
    }
    expect(failure.status).toBe(408)
    expect(bodyReads).toBe(1)
    expect(JSON.stringify(failure)).not.toContain('private-upload-reason')
  })
})
