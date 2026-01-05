import { Hono } from 'hono'
import { setupHonertia, createTemplate, createVersion, vite, registerErrorHandlers } from 'honertia'
import { shareAuthMiddleware } from 'honertia/auth'
import { createDb } from './db/db'
import { createAuth } from './lib/auth'
import { registerRoutes } from './routes'

type Bindings = {
  DB: D1Database
  BETTER_AUTH_SECRET: string
  ENVIRONMENT?: string
}

type Variables = {
  db: ReturnType<typeof createDb>
  auth: ReturnType<typeof createAuth>
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Middleware to set up db and auth
app.use('*', async (c, next) => {
  const db = createDb(c.env.DB)
  c.set('db', db)
  c.set('auth', createAuth({
      db,
      secret: c.env.BETTER_AUTH_SECRET,
      baseURL: new URL(c.req.url).origin,
    })
  )
  await next()
})

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
  setupHonertia({
    honertia: {
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
registerErrorHandlers(app)

export default app
