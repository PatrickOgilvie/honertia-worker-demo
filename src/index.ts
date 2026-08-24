import { createTemplate, createVersion, setupWeb, vite } from '@popcomputer/web'
import {
  EffectErrorObserverService,
  type EffectErrorEvent,
} from '@popcomputer/web/effect'
import { Effect, Layer } from 'effect'
import { registerRoutes } from './routes'
import { createAuth } from './lib/auth'
import * as schema from './db/schema'
import { projectRouteBindings } from './domain/project'
import { AuthUser, type AppEnv } from './types'
import { createDb } from './db/db'
import { Hono } from 'hono'
import { runtimeConfigMiddleware } from '~/runtime/runtime-config'
import { makeRequestCancellationLayer } from '~/runtime/request-cancellation'
import { makeRawRequestLayer } from '~/http/bounded-request-body'
import { noStoreResponse } from '~/http/no-store-response'

const app = new Hono<AppEnv>()

app.use('*', noStoreResponse)
app.use('*', runtimeConfigMiddleware)

// Materialize namespace exports because the binding compiler inspects own data descriptors.
const databaseSchema = { ...schema }

import manifest from '../dist/manifest.json'

const assetVersion = createVersion(manifest)
const entry = manifest['src/main.tsx']

const observeEffectError = Effect.fn('PopcomputerWebDemo.observeEffectError')(
  function* (event: EffectErrorEvent) {
    yield* Effect.sync(() => {
      console.error('@popcomputer/web:error', {
        source: event.source,
        handling: event.handling,
        kind: event.kind,
        hasStructuredError: event.structured !== undefined,
        errorType: event.error instanceof Error ? 'Error' : typeof event.error,
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
        secret: c.var.runtimeConfig.authSecret,
        baseURL: c.var.runtimeConfig.appOrigin,
        trustedOrigins: c.var.runtimeConfig.trustedOrigins,
        backgroundTasks,
        mode: c.var.runtimeConfig.mode,
      }),
    session: AuthUser,
    share: ({ user }) => ({
      id: user.id,
      name: user.name,
      email: user.email,
    }),
  },
  schema: databaseSchema,
  bindings: projectRouteBindings,
  version: assetVersion,
  render: createTemplate((ctx) => {
    const config = ctx.var.runtimeConfig
    const isDev = config.mode === 'development'
    if (isDev) {
      const vitePort = config.vitePort
      return {
        title: '@popcomputer/web Demo',
        scripts: [vite.script('/src/main.tsx', vitePort)],
        styles: [],
        head: vite.hmrHead(vitePort),
      }
    }

    return {
      title: '@popcomputer/web Demo',
      scripts: [`/${entry.file}`],
      styles: (entry.css ?? []).map((asset: string) => `/${asset}`),
      head: '',
    }
  }),
  effect: {
    services: (c) =>
      Layer.mergeAll(
        Layer.succeed(EffectErrorObserverService, {
          observe: observeEffectError,
        }),
        makeRequestCancellationLayer(c.req.raw.signal),
        makeRawRequestLayer(c.req.raw)
      ),
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
