import { resolve } from 'node:path'

const EXPECTED_CHECKS = new Map([
  ['bindings', 'warn'],
  ['naming', 'pass'],
  ['registration', 'pass'],
  ['routes', 'warn'],
])

const EXPECTED_ISSUES = [
  "info\0Resource 'api' has GET but no POST (create) route",
  "info\0Resource 'showcase' has GET but no POST (create) route",
  'warning\0DELETE route /projects/:project has no resource binding',
  'warning\0Route /projects/:project has 1 path params but 0 bindings',
  'warning\0Route /projects/:project has 1 path params but 0 bindings',
  'warning\0Route /projects/:project has 1 path params but 0 bindings',
  'warning\0Route /projects/:project/edit has 1 path params but 0 bindings',
].sort()

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input)
}

/** The framework CLI report drifted from the reviewed warning contract. */
export class UnexpectedFrameworkCheckReport extends Error {
  readonly _tag = 'UnexpectedFrameworkCheckReport' as const
}

function issueFingerprint(input: unknown): string | undefined {
  if (!isRecord(input)) return undefined
  if (input.type !== 'warning' && input.type !== 'info') return undefined
  if (typeof input.message !== 'string') return undefined
  return `${input.type}\0${input.message}`
}

/** Allows only the exact diagnostics justified by owner-scoped route policy. */
export function verifyFrameworkCheckReport(input: unknown): void {
  if (!isRecord(input) || !Array.isArray(input.checks)) {
    throw new UnexpectedFrameworkCheckReport(
      'The framework checker returned an invalid report.'
    )
  }

  const actualChecks = new Map<string, string>()
  for (const check of input.checks) {
    if (
      !isRecord(check) ||
      typeof check.name !== 'string' ||
      typeof check.status !== 'string'
    ) {
      throw new UnexpectedFrameworkCheckReport(
        'The framework checker returned an invalid check result.'
      )
    }
    actualChecks.set(check.name, check.status)
  }

  if (
    actualChecks.size !== EXPECTED_CHECKS.size ||
    [...EXPECTED_CHECKS].some(
      ([name, status]) => actualChecks.get(name) !== status
    )
  ) {
    throw new UnexpectedFrameworkCheckReport(
      'Framework check statuses changed from the reviewed contract.'
    )
  }

  if (!Array.isArray(input.issues)) {
    throw new UnexpectedFrameworkCheckReport(
      'The framework checker omitted its issue list.'
    )
  }
  const actualIssues = input.issues.map(issueFingerprint)
  if (actualIssues.some((issue) => issue === undefined)) {
    throw new UnexpectedFrameworkCheckReport(
      'The framework checker returned an invalid issue.'
    )
  }
  const sortedIssues = actualIssues.filter((issue) => issue !== undefined).sort()
  if (
    sortedIssues.length !== EXPECTED_ISSUES.length ||
    sortedIssues.some((issue, index) => issue !== EXPECTED_ISSUES[index])
  ) {
    throw new UnexpectedFrameworkCheckReport(
      'Framework diagnostics changed from the reviewed allowlist.'
    )
  }

  if (!isRecord(input.summary) || input.summary.failed !== 0) {
    throw new UnexpectedFrameworkCheckReport(
      'The framework checker reported a failed check.'
    )
  }
}

async function runFrameworkCheck(): Promise<void> {
  const projectDirectory = resolve(import.meta.dir, '..')
  const process = Bun.spawn({
    cmd: [
      Bun.which('bun') ?? 'bun',
      'node_modules/@popcomputer/web/dist/cli/bin.js',
      'check',
      '--app',
      'src/index.ts',
      '--json',
    ],
    cwd: projectDirectory,
    stdout: 'pipe',
    stderr: 'ignore',
  })
  const output = await new Response(process.stdout).text()
  const exitCode = await process.exited
  if (exitCode !== 0) {
    throw new UnexpectedFrameworkCheckReport(
      `The framework checker exited with code ${exitCode}.`
    )
  }

  const report: unknown = JSON.parse(output)
  verifyFrameworkCheckReport(report)
}

if (import.meta.main) {
  try {
    await runFrameworkCheck()
    console.log(
      'Framework check passed with only the seven reviewed route-policy diagnostics.'
    )
  } catch (cause: unknown) {
    console.error(
      cause instanceof UnexpectedFrameworkCheckReport
        ? cause.message
        : 'Framework check verification failed.'
    )
    process.exitCode = 1
  }
}
