# @popcomputer/web Demo

A demo application showcasing [@popcomputer/web](https://github.com/PatrickOgilvie/popcomputer-web) - an Inertia.js-style adapter for Hono with Effect v4 integration, running on Cloudflare Workers with D1 database and Better Auth authentication.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/PatrickOgilvie/popcomputer-web-demo)

## Features

- **Server-driven SPA** - @popcomputer/web enables server-side routing with client-side navigation
- **D1 Database** - SQLite-compatible database running on Cloudflare's edge
- **Authentication** - Full user registration and login with Better Auth
- **Effect v4** - Type-safe error handling and dependency injection
- **React + Tailwind** - Modern frontend stack

## Tech Stack

- [Hono](https://hono.dev) - Fast web framework for Cloudflare Workers
- [@popcomputer/web](https://github.com/PatrickOgilvie/popcomputer-web) - Inertia.js adapter for Hono
- [Effect](https://effect.website) - TypeScript effect system
- [Better Auth](https://www.better-auth.com) - Authentication library
- [Drizzle ORM](https://orm.drizzle.team) - TypeScript ORM for D1
- [React](https://react.dev) + [Inertia.js](https://inertiajs.com)
- [Tailwind CSS](https://tailwindcss.com)

## Local Development

1. Install dependencies:
   ```bash
   bun install
   ```

2. Copy the environment variables:
   ```bash
   cp .dev.vars.example .dev.vars
   ```

3. Build frontend assets:
   ```bash
   bun run build
   ```

4. Run local D1 migrations:
   ```bash
   bun run db:migrate:local
   ```

5. Start the development server:
   ```bash
   bun run dev
   ```

The app will be available at http://localhost:8787

## Project Structure

```
src/
├── index.ts              # Hono app entry point
├── routes.ts             # Route definitions
├── main.tsx              # React/Inertia client entry
├── styles.css            # Tailwind CSS
├── lib/
│   └── auth.ts           # Better Auth configuration
├── db/
│   ├── db.ts             # D1 database client
│   └── schema.ts         # Drizzle schema
├── actions/
│   └── dashboard.ts      # Dashboard action
└── pages/
    ├── Dashboard.tsx     # Dashboard page
    └── Auth/
        ├── Login.tsx     # Login page
        └── Register.tsx  # Registration page
```

## Deployment

### Option 1: Deploy Button (Recommended)

Click the deploy button at the top of this README. Cloudflare will automatically:
- Provision a D1 database
- Prompt you to set the `BETTER_AUTH_SECRET`
- Run migrations and deploy the worker

### Option 2: Manual Deployment

For first-time manual deployment, run setup to create the D1 database and set secrets:

```bash
bun run setup
```

After running setup, copy the database ID from the output and update `database_id` in `wrangler.toml`.

Then deploy:

```bash
bun run deploy
```

This will build the frontend, run migrations, and deploy the worker.

For subsequent deploys, just run `bun run deploy`.

## License

[MIT](LICENSE)
