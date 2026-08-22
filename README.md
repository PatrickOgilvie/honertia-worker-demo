# popcomputer-web-demo

A Cloudflare Workers demo for [@popcomputer/web](https://github.com/PatrickOgilvie/popcomputer-web), the Effect-powered, Inertia-style web adapter for Hono. This repository follows the upstream rename from Honertia to `@popcomputer/web` and demonstrates server-driven React pages, D1 persistence, and Better Auth.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/PatrickOgilvie/popcomputer-web-demo)

## Version baseline

The demo is migrated to Effect v4 and intentionally pins its prerelease dependencies exactly:

- `@popcomputer/web@0.4.0-rc.1` — the Effect v4 release published on npm's `next` channel
- `effect@4.0.0-rc.109` — the exact compatible Effect release

Using exact versions keeps the demo on the v4-compatible pair instead of allowing a floating dist-tag or prerelease range to select a different API surface.

## What the demo shows

### Server-driven React on Workers

Hono owns routing on the Worker, `@popcomputer/web` renders Inertia responses, and React handles client-side navigation. Application workflows use Effect v4 services, layers, schemas, typed failures, and named `Effect.fn` operations. The app also enables origin verification and observes Effect failures through a safe, structured error hook.

### Projects CRUD with explicit boundaries

Authenticated users can create, list, view, edit, and delete projects stored in D1. The feature demonstrates several framework capabilities together:

- Effect Schema domain and command models, including UUID, length, and visibility constraints
- strict body-only mutation parsing with `onExcessProperty: 'error'` to reject undeclared fields
- server-owned `userId` assignment and ownership checks through `authorize`
- persistence rows decoded before they are projected into browser-safe props
- `dbMutation` for typed write and constraint failures
- declarative route-model binding through `setupWeb({ bindings })` and `bound('project')`
- retry-safe project creation using a client-stable project identifier

Private project routes run under `RequireAuthLayer`. A separate anonymous route, `/showcase/projects/{project}`, renders public projects and returns 404 for private ones.

The protected `GET /api/projects` route returns the same browser-safe resources as JSON. Its payload is decoded against the declared response schema before being sent, so the generated OpenAPI success contract and the runtime response share one source of truth.

### Workers Cache and invalidation

The public project showcase enables the first-class Workers Cache policy for 60 seconds with a 300-second stale-while-revalidate window. The framework derives cache tags from route bindings, while project create, update, and delete routes declare the corresponding purges. Authenticated and otherwise private requests are not placed into the public cache.

Workers Cache support is enabled in `wrangler.toml`:

```toml
[cache]
enabled = true
```

The checked-in `wrangler@4.124.0` and matching Workers types support the 2026-08-04 compatibility date used with this cache setup.

### Token-safe session management

The protected `/sessions` page uses `effectifyBetterAuth` with `AuthService` and `RequestService` to list active Better Auth sessions, revoke one other session, or revoke every other session.

Session tokens remain server-side. Better Auth results are parsed into a schema that wraps tokens as `Redacted`; the browser receives only an explicit non-secret session projection. Individual revocation posts a session ID, resolves the corresponding token from the authenticated user's active sessions on the server, and unwraps it only for the Better Auth revoke call. The current session can be ended through sign out, while “revoke other sessions” preserves it.

Because this focused demo does not include a reauthentication screen, it explicitly sets Better Auth's `session.freshAge` to `0`; session-management actions therefore remain available for the lifetime of a valid login. A production account-management flow should normally keep a freshness window and send stale sessions through reauthentication instead.

## Tech stack

- [Hono](https://hono.dev) on Cloudflare Workers
- [@popcomputer/web](https://github.com/PatrickOgilvie/popcomputer-web) with Effect v4
- [Better Auth](https://www.better-auth.com)
- Cloudflare D1 with [Drizzle ORM](https://orm.drizzle.team)
- [React](https://react.dev) and [Inertia.js](https://inertiajs.com)
- [Tailwind CSS](https://tailwindcss.com) and Vite
- Bun for dependency management, scripts, and tests

## Local development

1. Install dependencies:

   ```bash
   bun install
   ```

2. Copy the local environment variables and replace the example secret:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Apply both local D1 migrations:

   ```bash
   bun run db:migrate:local
   ```

4. Start Vite and Wrangler together:

   ```bash
   bun run dev
   ```

The development command first creates the production manifest and asset
directory required by Wrangler, so it also works on a fresh checkout. Vite then
serves live frontend changes during development.

The Worker is available at <http://localhost:8787>. Vite serves development assets on port 5173.

## Database migrations

The checked-in migrations are applied in order:

- `migrations/0000_initial.sql` creates Better Auth users, sessions, accounts, and verification tables.
- `migrations/0001_projects.sql` creates the projects table, database constraints, and lookup indexes.

Use `bun run db:migrate:local` for local D1 and `bun run db:migrate` for the configured remote database. Add a new numbered migration when changing persisted schema; do not edit a migration that has already been applied to a shared database.

## Framework CLI and checks

The package scripts invoke the CLI from the exact installed `@popcomputer/web` release:

```bash
bun run routes       # Print the application-owned route registry
bun run check        # Check route names, schemas, bindings, and configuration
bun run openapi      # Regenerate openapi.json for the protected JSON slice
bun run typecheck    # Run TypeScript without emitting files
bun test             # Run the Bun test suite
bun run test:worker  # Exercise a temporary migrated D1 database in Workerd
bun run build        # Build production client assets
bun run deploy:dry   # Bundle the Worker and assets without publishing
bun run verify       # Run the complete unit, framework, runtime, and bundle suite
```

`openapi.json` is deliberately scoped to `/api`. Its documented 200 JSON payload is runtime-validated and wire-accurate. The current rc generator still provides only partial authentication and error documentation, so the file is not a complete contract for every possible response. `bun run routes` and `bun run check` continue to inspect the full Inertia application; rendered HTML, Inertia page objects, redirects, and cookies are intentionally outside the OpenAPI slice.

## Project structure

```text
.
├── migrations/
│   ├── 0000_initial.sql          # Better Auth tables
│   └── 0001_projects.sql         # Projects table and constraints
├── openapi.json                  # Generated protected JSON API contract
├── src/
│   ├── actions/
│   │   ├── auth.ts               # Login, registration, and logout
│   │   ├── dashboard.ts          # Authenticated landing page
│   │   ├── projects.ts           # CRUD, ownership, bindings, and purges
│   │   └── sessions.ts           # Effect-native Better Auth session actions
│   ├── components/               # Shared React shells and form controls
│   ├── db/
│   │   ├── db.ts                 # Drizzle D1 client
│   │   └── schema.ts             # Better Auth and project tables
│   ├── domain/
│   │   ├── project.ts            # Effect Schema project model and commands
│   │   └── project.test.ts       # Boundary and projection tests
│   ├── lib/
│   │   └── auth.ts               # Request-scoped Better Auth factory
│   ├── pages/
│   │   ├── Auth/                 # Login and registration pages
│   │   ├── Errors/               # Shared error page
│   │   ├── Projects/             # CRUD and public showcase pages
│   │   ├── Sessions/             # Active-session management page
│   │   └── Dashboard.tsx
│   ├── presentation/
│   │   └── project.ts            # Browser-safe project projections
│   ├── index.ts                  # Hono/setupWeb composition root
│   ├── main.tsx                  # React/Inertia client entry
│   ├── routes.ts                 # Route registry and policies
│   ├── styles.css                # Tailwind and application styles
│   └── types.ts                  # App bindings and module augmentation
├── package.json
└── wrangler.toml                 # Worker, assets, cache, and D1 config
```

## Deployment

### Option 1: Deploy Button (Recommended)

Click the deploy button at the top of this README. Cloudflare will automatically:

- Provision a D1 database
- Prompt you to set the `BETTER_AUTH_SECRET`
- Run migrations and deploy the Worker

### Option 2: Manual Deployment

For first-time manual deployment, run setup to create the D1 database and set secrets:

```bash
bun run setup
```

Setup updates the `DB` binding in `wrangler.toml` with the new database ID automatically.

Then deploy:

```bash
bun run deploy
```

This builds the frontend, applies remote migrations, and deploys the Worker. For subsequent deploys, run `bun run deploy` again.

## License

[MIT](LICENSE)
