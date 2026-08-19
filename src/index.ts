import { createTemplate, createVersion, setupWeb, vite } from '@popcomputer/web'
import {
  EffectErrorObserverService,
  type EffectErrorEvent,
} from '@popcomputer/web/effect'
import { Effect, Layer } from 'effect'
import { registerRoutes } from './routes'
import { createAuth } from './lib/auth'
import * as schema from './db/schema'
import { AuthUser, type AppEnv } from './types'
import { createDb } from './db/db'
import { Hono } from 'hono'

const app = new Hono<AppEnv>()

// @ts-ignore - Generated at build time
import manifest from '../dist/manifest.json'

const assetVersion = createVersion(manifest)
const entry = manifest['src/main.tsx'] ?? { file: '', css: [] }

const observeEffectError = Effect.fn('PopcomputerWebDemo.observeEffectError')(
  function* (event: EffectErrorEvent) {
    yield* Effect.sync(() => {
      console.error('@popcomputer/web:error', {
        source: event.source,
        handling: event.handling,
        kind: event.kind,
        code: event.structured?.code,
        errorType:
          event.error instanceof Error ? event.error.name : typeof event.error,
      })
    })
  }
)

setupWeb(app, {
  database: (c) => createDb(c.env.DB),
  auth: {
    client: (c, { db, backgroundTasks }) =>
      createAuth({
        db,
        secret: c.env.BETTER_AUTH_SECRET,
        baseURL: new URL(c.req.url).origin,
        trustedOrigins: c.env.BETTER_AUTH_TRUSTED_ORIGINS,
        environment: c.env.ENVIRONMENT,
        backgroundTasks,
      }),
    session: AuthUser,
    share: ({ user }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }),
  },
  schema,
  version: assetVersion,
  render: createTemplate((ctx) => {
    const isDev = ctx.env.ENVIRONMENT !== 'production'
    return {
      title: '@popcomputer/web Demo',
      scripts: isDev ? [vite.script()] : [`/${entry.file}`],
      styles: isDev ? [] : (entry.css ?? []).map((asset: string) => `/${asset}`),
      head: isDev ? vite.hmrHead() : '',
    }
  }),
  effect: {
    services: () =>
      Layer.succeed(EffectErrorObserverService, {
        observe: observeEffectError,
      }),
  },
  security: {
    verifyOrigin: {},
  },
  errors: {
    component: 'Errors/Error',
    showDevErrors: true,
    envKey: 'ENVIRONMENT',
    devValue: 'development',
  },
})

// Register all routes
registerRoutes(app)
export default app
