import type { MiddlewareHandler } from 'hono'

/** Prevents every dynamic Worker response, including errors, from being cached. */
export const noStoreResponse: MiddlewareHandler = async (context, next) => {
  await next()
  context.header('Cache-Control', 'no-store')
}
