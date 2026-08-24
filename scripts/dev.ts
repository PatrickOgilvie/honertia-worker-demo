import concurrently from 'concurrently'
import { createServer } from 'node:net'

import {
  createDevServerEnvironment,
  DEFAULT_VITE_PORT,
  DEFAULT_WORKER_PORT,
} from './dev-environment'

const MAX_PORT_OFFSET = 100
const LOOPBACK_HOSTS = ['127.0.0.1', '::1'] as const

type PortAvailability = (port: number) => Promise<boolean>

/** The paired ports used by the local Worker and Vite development servers. */
export interface DevServerPorts {
  readonly offset: number
  readonly worker: number
  readonly vite: number
}

class DevPortProbeError extends Error {
  readonly _tag = 'DevPortProbeError' as const

  constructor(
    readonly port: number,
    readonly host: string,
    cause: unknown
  ) {
    super(`Could not check development port ${port} on ${host}.`, { cause })
  }
}

function readErrorCode(cause: unknown): string | undefined {
  if (typeof cause !== 'object' || cause === null || !('code' in cause)) {
    return undefined
  }

  const code = Reflect.get(cause, 'code')
  return typeof code === 'string' ? code : undefined
}

function canListenOnHost(port: number, host: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = createServer()

    server.once('error', (cause: unknown) => {
      const code = readErrorCode(cause)
      if (code === 'EADDRINUSE') {
        resolve(false)
        return
      }
      if (code === 'EADDRNOTAVAIL' || code === 'EAFNOSUPPORT') {
        resolve(true)
        return
      }

      reject(new DevPortProbeError(port, host, cause))
    })
    server.listen({ host, port, exclusive: true }, () => {
      server.close((cause) => {
        if (cause !== undefined) {
          reject(new DevPortProbeError(port, host, cause))
          return
        }
        resolve(true)
      })
    })
  })
}

async function isPortAvailable(port: number): Promise<boolean> {
  for (const host of LOOPBACK_HOSTS) {
    if (!(await canListenOnHost(port, host))) return false
  }

  return true
}

/** Finds the first offset for which both default development ports are free. */
export async function findDevServerPorts(
  checkPort: PortAvailability = isPortAvailable
): Promise<DevServerPorts | undefined> {
  for (let offset = 0; offset <= MAX_PORT_OFFSET; offset += 1) {
    const worker = DEFAULT_WORKER_PORT + offset
    const vite = DEFAULT_VITE_PORT + offset
    const [workerAvailable, viteAvailable] = await Promise.all([
      checkPort(worker),
      checkPort(vite),
    ])

    if (workerAvailable && viteAvailable) {
      return { offset, worker, vite }
    }
  }

  return undefined
}

/** Builds the Worker command with configuration matching the selected pair. */
export function createWorkerDevCommand(ports: DevServerPorts): string {
  const environment = createDevServerEnvironment(ports)

  return [
    'bun run dev:worker --',
    `--port ${ports.worker}`,
    '--var ENVIRONMENT:development',
    `--var APP_ORIGIN:${environment.DEV_WORKER_ORIGIN}`,
    `--var DEV_VITE_PORT:${ports.vite}`,
  ].join(' ')
}

async function runDevelopmentServers(): Promise<number> {
  let ports: DevServerPorts | undefined
  try {
    ports = await findDevServerPorts()
  } catch (cause: unknown) {
    if (cause instanceof DevPortProbeError) {
      console.error(cause.message)
      return 1
    }
    throw cause
  }

  if (ports === undefined) {
    console.error('Could not find an available port pair for Wrangler and Vite.')
    return 1
  }

  Object.assign(process.env, createDevServerEnvironment(ports))

  if (ports.offset > 0) {
    console.log(`Default ports are busy; shifted both servers by ${ports.offset}.`)
  }
  console.log(
    `Worker: http://localhost:${ports.worker} · Vite: http://localhost:${ports.vite}`
  )

  const { result } = concurrently(
    [
      { command: 'bun run dev:vite', name: 'vite' },
      {
        command: createWorkerDevCommand(ports),
        name: 'worker',
      },
    ],
    {
      killOthersOn: ['failure', 'success'],
      prefix: 'name',
      prefixColors: ['magenta', 'cyan'],
    }
  )

  try {
    await result
    return 0
  } catch (_cause: unknown) {
    return 1
  }
}

if (import.meta.main) {
  process.exitCode = await runDevelopmentServers()
}
