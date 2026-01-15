import { setupHonertia, createTemplate, createVersion, vite, registerErrorHandlers } from 'honertia'
import { registerRoutes } from './routes'
import { createAuth } from './lib/auth'
import * as schema from './db/schema'
import type { AppEnv } from './types'
import { createDb } from './db/db'
import { Hono } from 'hono'

const app = new Hono<AppEnv>()

// @ts-ignore - Generated at build time
import manifest from '../dist/manifest.json'

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
        trustedOrigins: c.env.BETTER_AUTH_TRUSTED_ORIGINS,
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
  })
)

// Register all routes
registerRoutes(app)
registerErrorHandlers(app, {
  component: 'Errors/Error',
  showDevErrors: true,       // Show detailed errors in development
  envKey: 'ENVIRONMENT',     // Env var to check
  devValue: 'development',
})

export default app
