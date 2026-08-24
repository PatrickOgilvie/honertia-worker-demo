export const DEFAULT_WORKER_PORT = 8787
export const DEFAULT_VITE_PORT = 5173

/** Environment shared by the paired Worker and Vite development processes. */
export interface DevServerEnvironment {
  readonly DEV_VITE_PORT: string
  readonly DEV_WORKER_ORIGIN: string
}

/** Validated Vite settings derived from the paired development environment. */
export interface ViteDevServerConfiguration {
  readonly port: number
  readonly viteOrigin: string
  readonly workerOrigin: string
}

function readPort(value: string | undefined): number {
  if (value === undefined) return DEFAULT_VITE_PORT

  const port = Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('DEV_VITE_PORT must be an integer between 1 and 65535.')
  }

  return port
}

function readWorkerOrigin(value: string | undefined): string {
  const raw = value ?? `http://localhost:${DEFAULT_WORKER_PORT}`
  let origin: URL

  try {
    origin = new URL(raw)
  } catch {
    throw new Error('DEV_WORKER_ORIGIN must be an exact loopback HTTP origin.')
  }

  const loopback =
    origin.hostname === 'localhost' ||
    origin.hostname === '127.0.0.1' ||
    origin.hostname === '[::1]'
  if (
    origin.protocol !== 'http:' ||
    !loopback ||
    origin.port === '' ||
    origin.username !== '' ||
    origin.password !== '' ||
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    origin.origin !== raw
  ) {
    throw new Error('DEV_WORKER_ORIGIN must be an exact loopback HTTP origin.')
  }

  return origin.origin
}

/** Builds the inherited environment for one selected local port pair. */
export function createDevServerEnvironment(ports: {
  readonly worker: number
  readonly vite: number
}): DevServerEnvironment {
  return {
    DEV_VITE_PORT: String(ports.vite),
    DEV_WORKER_ORIGIN: `http://localhost:${ports.worker}`,
  }
}

/** Parses the only two environment values consumed by Vite configuration. */
export function readViteDevServerConfiguration(
  environment?: {
    readonly DEV_VITE_PORT?: string
    readonly DEV_WORKER_ORIGIN?: string
  }
): ViteDevServerConfiguration {
  const values = environment ?? {
    DEV_VITE_PORT: process.env.DEV_VITE_PORT,
    DEV_WORKER_ORIGIN: process.env.DEV_WORKER_ORIGIN,
  }
  const port = readPort(values.DEV_VITE_PORT)
  return {
    port,
    viteOrigin: `http://localhost:${port}`,
    workerOrigin: readWorkerOrigin(values.DEV_WORKER_ORIGIN),
  }
}
