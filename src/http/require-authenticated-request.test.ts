import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'

import { requireAuthenticatedRequest } from '~/http/require-authenticated-request'
import type { AppEnv } from '~/types'

describe('authenticated request middleware', () => {
  test('redirects before a protected handler can parse input', async () => {
    const app = new Hono<AppEnv>()
    let downstreamCalled = false

    app.use('/projects/*', requireAuthenticatedRequest)
    app.get('/projects/:project', (context) => {
      downstreamCalled = true
      return context.text(context.req.param('project'))
    })

    const response = await app.request('/projects/not-a-valid-project-id')

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/login')
    expect(downstreamCalled).toBe(false)
  })

  test('returns a protocol-appropriate 401 for protected API routes', async () => {
    const app = new Hono<AppEnv>()
    app.use('/api/*', requireAuthenticatedRequest)
    app.get('/api/projects', (context) => context.json({ projects: [] }))

    const response = await app.request('/api/projects')

    expect(response.status).toBe(401)
    expect(await response.text()).toBe(
      JSON.stringify({ message: 'Authentication required.' })
    )
  })

  test('rejects an unauthenticated oversized stream before reading its body', async () => {
    const app = new Hono<AppEnv>()
    let bodyReads = 0
    let downstreamCalled = false

    app.use('/projects/*', requireAuthenticatedRequest)
    app.post('/projects/create', async (context) => {
      downstreamCalled = true
      await context.req.text()
      return context.text('created')
    })

    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          bodyReads += 1
          controller.enqueue(new Uint8Array(9 * 1024))
          controller.close()
        },
      },
      { highWaterMark: 0 }
    )
    const requestInit: RequestInit & { readonly duplex: 'half' } = {
      method: 'POST',
      body,
      duplex: 'half',
    }
    const response = await app.request(
      new Request('http://localhost/projects/create', requestInit)
    )

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/login')
    expect(downstreamCalled).toBe(false)
    expect(bodyReads).toBe(0)
  })
})
