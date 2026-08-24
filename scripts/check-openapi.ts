import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** The generated OpenAPI contract differs from the checked-in artifact. */
export class StaleOpenApiDocument extends Error {
  readonly _tag = 'StaleOpenApiDocument' as const
}

function canonicalJson(input: unknown): string {
  if (Array.isArray(input)) {
    return `[${input.map(canonicalJson).join(',')}]`
  }
  if (typeof input === 'object' && input !== null) {
    return `{${Object.entries(input)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, value]) => `${JSON.stringify(key)}:${canonicalJson(value)}`
      )
      .join(',')}}`
  }
  return JSON.stringify(input)
}

/** Compares OpenAPI documents semantically while ignoring JSON formatting. */
export function verifyOpenApiDocument(
  checkedIn: unknown,
  generated: unknown
): void {
  if (canonicalJson(checkedIn) !== canonicalJson(generated)) {
    throw new StaleOpenApiDocument(
      'openapi.json is stale. Run `bun run openapi` and review the contract change.'
    )
  }
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function checkOpenApi(): Promise<void> {
  const projectDirectory = resolve(import.meta.dir, '..')
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), 'honertia-openapi-check-')
  )
  const generatedPath = join(temporaryDirectory, 'openapi.json')

  try {
    const process = Bun.spawn({
      cmd: [
        Bun.which('bun') ?? 'bun',
        'node_modules/@popcomputer/web/dist/cli/bin.js',
        'generate:openapi',
        '--app',
        'src/index.ts',
        '--include',
        '/api',
        '--title',
        'Popcomputer Web Demo API',
        '--version',
        '1.0.0-rc.1',
        '--description',
        'Protected JSON showcase for @popcomputer/web',
        '--output',
        generatedPath,
      ],
      cwd: projectDirectory,
      stdout: 'ignore',
      stderr: 'pipe',
    })
    const errorOutput = await new Response(process.stderr).text()
    const exitCode = await process.exited
    if (exitCode !== 0) {
      throw new StaleOpenApiDocument(
        `OpenAPI generation failed with code ${exitCode}${
          errorOutput.length === 0 ? '.' : `: ${errorOutput.trim()}`
        }`
      )
    }

    const [checkedIn, generated] = await Promise.all([
      readJson(join(projectDirectory, 'openapi.json')),
      readJson(generatedPath),
    ])
    verifyOpenApiDocument(checkedIn, generated)
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  try {
    await checkOpenApi()
    console.log('Verified that openapi.json matches the generated contract.')
  } catch (cause: unknown) {
    console.error(
      cause instanceof Error ? cause.message : 'OpenAPI verification failed.'
    )
    process.exitCode = 1
  }
}
