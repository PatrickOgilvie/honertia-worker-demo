import { describe, expect, test } from 'bun:test'

import {
  createDevServerEnvironment,
  readViteDevServerConfiguration,
} from './dev-environment'
import { createWorkerDevCommand, findDevServerPorts } from './dev'

describe('development server port selection', () => {
  test('uses the default pair when both ports are available', async () => {
    const ports = await findDevServerPorts(async () => true)

    expect(ports).toEqual({ offset: 0, worker: 8787, vite: 5173 })
  })

  test('increments both ports when the Worker port is busy', async () => {
    const ports = await findDevServerPorts(async (port) => port !== 8787)

    expect(ports).toEqual({ offset: 1, worker: 8788, vite: 5174 })
  })

  test('keeps scanning until an entire pair is available', async () => {
    const occupiedPorts = new Set([5173, 8788])
    const ports = await findDevServerPorts(
      async (port) => !occupiedPorts.has(port)
    )

    expect(ports).toEqual({ offset: 2, worker: 8789, vite: 5175 })
  })

  test('reports when no paired ports are available', async () => {
    const ports = await findDevServerPorts(async () => false)

    expect(ports).toBeUndefined()
  })

  test('passes a matching development origin and Vite port to the Worker', () => {
    const ports = {
      offset: 2,
      worker: 8789,
      vite: 5175,
    }
    const command = createWorkerDevCommand(ports)

    expect(command).toBe(
      'bun run dev:worker -- --port 8789 --var ENVIRONMENT:development --var APP_ORIGIN:http://localhost:8789 --var DEV_VITE_PORT:5175'
    )
    expect(createDevServerEnvironment(ports)).toEqual({
      DEV_VITE_PORT: '5175',
      DEV_WORKER_ORIGIN: 'http://localhost:8789',
    })
  })

  test('restricts Vite CORS to the exact paired loopback Worker origin', () => {
    expect(
      readViteDevServerConfiguration({
        DEV_VITE_PORT: '5175',
        DEV_WORKER_ORIGIN: 'http://localhost:8789',
      })
    ).toEqual({
      port: 5175,
      viteOrigin: 'http://localhost:5175',
      workerOrigin: 'http://localhost:8789',
    })

    expect(() =>
      readViteDevServerConfiguration({
        DEV_VITE_PORT: '5175',
        DEV_WORKER_ORIGIN: 'https://example.com',
      })
    ).toThrow('DEV_WORKER_ORIGIN must be an exact loopback HTTP origin.')
  })
})
