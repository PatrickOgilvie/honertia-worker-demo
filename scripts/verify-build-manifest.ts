import { readFile, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const CLIENT_ENTRY = 'src/main.tsx'
const MANIFEST_NAME = 'manifest.json'

interface ManifestEntry {
  readonly assets?: ReadonlyArray<string>
  readonly css?: ReadonlyArray<string>
  readonly dynamicImports?: ReadonlyArray<string>
  readonly file: string
  readonly imports?: ReadonlyArray<string>
  readonly isEntry?: boolean
  readonly src?: string
}

/** A production client manifest did not satisfy the Worker's asset contract. */
export class InvalidBuildManifest extends Error {
  readonly _tag = 'InvalidBuildManifest' as const

  constructor(readonly issues: ReadonlyArray<string>) {
    super(`Invalid Vite build manifest:\n- ${issues.join('\n- ')}`)
  }
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

function readStringList(
  entryKey: string,
  property: string,
  value: unknown,
  issues: Array<string>
): ReadonlyArray<string> | undefined {
  if (value === undefined) return undefined
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    issues.push(`Manifest entry "${entryKey}" has an invalid ${property} list.`)
    return undefined
  }

  return value
}

function readManifestEntry(
  key: string,
  input: unknown,
  issues: Array<string>
): ManifestEntry | undefined {
  if (!isRecord(input)) {
    issues.push(`Manifest entry "${key}" must be an object.`)
    return undefined
  }

  if (typeof input.file !== 'string' || input.file.length === 0) {
    issues.push(`Manifest entry "${key}" is missing its output file.`)
    return undefined
  }

  const assets = readStringList(key, 'assets', input.assets, issues)
  const css = readStringList(key, 'css', input.css, issues)
  const imports = readStringList(key, 'imports', input.imports, issues)
  const dynamicImports = readStringList(
    key,
    'dynamicImports',
    input.dynamicImports,
    issues
  )

  if (input.isEntry !== undefined && typeof input.isEntry !== 'boolean') {
    issues.push(`Manifest entry "${key}" has an invalid isEntry flag.`)
  }
  if (input.src !== undefined && typeof input.src !== 'string') {
    issues.push(`Manifest entry "${key}" has an invalid source path.`)
  }

  return {
    file: input.file,
    ...(assets === undefined ? {} : { assets }),
    ...(css === undefined ? {} : { css }),
    ...(imports === undefined ? {} : { imports }),
    ...(dynamicImports === undefined ? {} : { dynamicImports }),
    ...(typeof input.isEntry === 'boolean' ? { isEntry: input.isEntry } : {}),
    ...(typeof input.src === 'string' ? { src: input.src } : {}),
  }
}

function isSafeAssetPath(assetPath: string, distDirectory: string): boolean {
  const segments = assetPath.split('/')
  if (
    assetPath.includes('\\') ||
    assetPath.includes('\0') ||
    assetPath.includes('?') ||
    assetPath.includes('#') ||
    isAbsolute(assetPath) ||
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..'
    )
  ) {
    return false
  }

  const resolvedAsset = resolve(distDirectory, assetPath)
  const relativeAsset = relative(distDirectory, resolvedAsset)
  return (
    relativeAsset !== '' &&
    relativeAsset !== '..' &&
    !relativeAsset.startsWith(`..${sep}`) &&
    !isAbsolute(relativeAsset)
  )
}

/**
 * Verifies the production entry and every file referenced by Vite's manifest.
 * The asset predicate keeps the boundary deterministic in unit tests.
 */
export async function verifyBuildManifest(
  input: unknown,
  options: {
    readonly distDirectory: string
    readonly assetExists: (assetPath: string) => Promise<boolean>
  }
): Promise<void> {
  const issues: Array<string> = []
  if (!isRecord(input)) {
    throw new InvalidBuildManifest(['The manifest root must be an object.'])
  }

  const entries = new Map<string, ManifestEntry>()
  for (const [key, value] of Object.entries(input)) {
    const entry = readManifestEntry(key, value, issues)
    if (entry !== undefined) entries.set(key, entry)
  }

  const clientEntry = entries.get(CLIENT_ENTRY)
  if (clientEntry === undefined) {
    issues.push(`The required client entry "${CLIENT_ENTRY}" is missing.`)
  } else {
    if (clientEntry.isEntry !== true || clientEntry.src !== CLIENT_ENTRY) {
      issues.push(`The client entry "${CLIENT_ENTRY}" is not a Vite entry.`)
    }
    if (!clientEntry.file.endsWith('.js')) {
      issues.push(`The client entry "${CLIENT_ENTRY}" must emit JavaScript.`)
    }
    if (clientEntry.css === undefined || clientEntry.css.length === 0) {
      issues.push(`The client entry "${CLIENT_ENTRY}" must emit CSS.`)
    }
  }

  const assetPaths = new Set<string>()
  for (const [key, entry] of entries) {
    assetPaths.add(entry.file)
    for (const assetPath of entry.assets ?? []) assetPaths.add(assetPath)
    for (const cssPath of entry.css ?? []) {
      assetPaths.add(cssPath)
      if (!cssPath.endsWith('.css')) {
        issues.push(
          `Manifest entry "${key}" references non-CSS stylesheet "${cssPath}".`
        )
      }
    }

    for (const importedKey of [
      ...(entry.imports ?? []),
      ...(entry.dynamicImports ?? []),
    ]) {
      if (!entries.has(importedKey)) {
        issues.push(
          `Manifest entry "${key}" references missing entry "${importedKey}".`
        )
      }
    }
  }

  const reachableEntries = new Set<string>()
  const pendingEntries = [CLIENT_ENTRY]
  while (pendingEntries.length > 0) {
    const key = pendingEntries.pop()
    if (key === undefined || reachableEntries.has(key)) continue

    const entry = entries.get(key)
    if (entry === undefined) continue
    reachableEntries.add(key)
    pendingEntries.push(
      ...(entry.imports ?? []),
      ...(entry.dynamicImports ?? [])
    )
  }

  for (const key of reachableEntries) {
    const file = entries.get(key)?.file
    if (file !== undefined && !file.endsWith('.js')) {
      issues.push(
        `Reachable JavaScript entry "${key}" emits non-JavaScript file "${file}".`
      )
    }
  }

  await Promise.all(
    [...assetPaths].map(async (assetPath) => {
      if (!isSafeAssetPath(assetPath, options.distDirectory)) {
        issues.push(`Manifest asset "${assetPath}" is not a safe relative path.`)
        return
      }
      if (!(await options.assetExists(assetPath))) {
        issues.push(`Manifest asset "${assetPath}" does not exist.`)
      }
    })
  )

  if (issues.length > 0) {
    throw new InvalidBuildManifest(issues.sort())
  }
}

/** Reads and verifies the manifest emitted into a production dist directory. */
export async function verifyBuildDirectory(
  distDirectory = resolve(import.meta.dir, '..', 'dist')
): Promise<void> {
  const manifestPath = join(distDirectory, MANIFEST_NAME)
  let manifest: unknown

  try {
    manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  } catch (cause: unknown) {
    throw new InvalidBuildManifest([
      `Could not read ${MANIFEST_NAME}: ${
        cause instanceof SyntaxError ? 'invalid JSON' : 'file not found'
      }.`,
    ])
  }

  await verifyBuildManifest(manifest, {
    distDirectory,
    assetExists: async (assetPath) => {
      try {
        return (await stat(join(distDirectory, assetPath))).isFile()
      } catch (_cause: unknown) {
        return false
      }
    },
  })
}

if (import.meta.main) {
  try {
    await verifyBuildDirectory()
    console.log('Verified the production client manifest and referenced assets.')
  } catch (cause: unknown) {
    console.error(
      cause instanceof Error ? cause.message : 'Build manifest verification failed.'
    )
    process.exitCode = 1
  }
}
