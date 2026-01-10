import { Hono } from 'hono'
import { setupHonertia, createTemplate, createVersion, vite, registerErrorHandlers } from 'honertia'
import { shareAuthMiddleware } from 'honertia/auth'
import { createDb } from './db/db'
import { createAuth } from './lib/auth'
import { registerRoutes } from './routes'
import * as schema from './db/schema'
import type { AppEnv } from './types'

const app = new Hono<AppEnv>()

// Import manifest - generated at build time (may not exist in dev)
let manifest: Record<string, { file: string; css?: string[] }> = {}
try {
  manifest = (await import('../dist/manifest.json')).default
} catch {
  // Manifest doesn't exist in dev mode
}

const assetVersion = createVersion(manifest)
const entry = manifest['src/main.tsx'] || { file: '', css: [] }

app.use(
  '*',
  setupHonertia<AppEnv>({
    honertia: {
      database: (c) => createDb(c.env.DB),
      auth: (c) => createAuth({
        db: c.var.db,
        secret: c.env.BETTER_AUTH_SECRET,
        baseURL: new URL(c.req.url).origin,
      }),
      schema,
      version: assetVersion,
      render: createTemplate((ctx) => {
        const isDev = ctx.env.ENVIRONMENT !== 'production'
        return {
          title: 'Honertia Demo',
          scripts: isDev ? [vite.script()] : [`/${entry.file}`],
          styles: isDev ? [] : (entry.css || []).map((s) => `/${s}`),
          head: isDev ? vite.hmrHead() : '',
        }
      }),
    },
    middleware: [shareAuthMiddleware()],
  })
)

// Register all routes
registerRoutes(app)
registerErrorHandlers(app, {
  component: 'Errors/Error',
})

export default app
