import { webContext } from '@popcomputer/web'
import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from '~/types'

/**
 * Rejects guests before an Effect route parses parameters, binds models, or
 * reads request input. RequireAuthLayer remains the in-Effect type guarantee.
 */
export const requireAuthenticatedRequest: MiddlewareHandler<AppEnv> = async (
  context,
  next
) => {
  if (webContext(context).authUser === undefined) {
    if (context.req.path.startsWith('/api/')) {
      return context.json({ message: 'Authentication required.' }, 401)
    }

    const status = context.req.header('X-Inertia') === 'true' ? 303 : 302
    return context.redirect('/login', status)
  }

  await next()
  return context.res
}
