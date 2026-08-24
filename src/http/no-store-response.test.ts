import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'

import { noStoreResponse } from '~/http/no-store-response'

describe('no-store response policy', () => {
  test('marks both successful and not-found route responses as non-cacheable', async () => {
    const app = new Hono()
    app.use('/showcase/:project', noStoreResponse)
    app.get('/showcase/:project', (context) =>
      context.req.param('project') === 'public'
        ? context.text('public')
        : context.notFound()
    )

    const [visible, missing] = await Promise.all([
      app.request('/showcase/public'),
      app.request('/showcase/private'),
    ])

    expect(visible.headers.get('cache-control')).toBe('no-store')
    expect(missing.headers.get('cache-control')).toBe('no-store')
  })
})
