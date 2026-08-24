import { deleteExpiredRateLimitRows } from '~/adapters/d1-rate-limit-cleanup'
import { createDb } from '~/db/db'
import app from '~/index'
import type { Bindings } from '~/types'

function safeRateLimitCleanup(database: ReturnType<typeof createDb>) {
  return deleteExpiredRateLimitRows(database).catch(() => {
    console.error('@popcomputer/web:rate-limit-cleanup', {
      source: 'scheduled',
      kind: 'cleanup-failed',
    })
  })
}

/** Cloudflare Worker lifecycle wrapper; the route-aware Hono app stays inspectable. */
const worker = {
  fetch: (
    request: Request,
    environment: Bindings,
    executionContext: ExecutionContext
  ) => app.fetch(request, environment, executionContext),
  scheduled: (
    _controller: ScheduledController,
    environment: Bindings,
    executionContext: ExecutionContext
  ) => {
    executionContext.waitUntil(
      safeRateLimitCleanup(createDb(environment.DB))
    )
  },
} satisfies ExportedHandler<Bindings>

export default worker
