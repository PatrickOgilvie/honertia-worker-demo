import { describe, expect, test } from 'bun:test'

import {
  UnexpectedFrameworkCheckReport,
  verifyFrameworkCheckReport,
} from './check-framework'

const reviewedIssues = [
  {
    type: 'warning',
    message: 'DELETE route /projects/:project has no resource binding',
  },
  {
    type: 'info',
    message: "Resource 'showcase' has GET but no POST (create) route",
  },
  {
    type: 'info',
    message: "Resource 'api' has GET but no POST (create) route",
  },
  ...Array.from({ length: 3 }, () => ({
    type: 'warning',
    message: 'Route /projects/:project has 1 path params but 0 bindings',
  })),
  {
    type: 'warning',
    message:
      'Route /projects/:project/edit has 1 path params but 0 bindings',
  },
]

function reviewedReport(issues: ReadonlyArray<unknown> = reviewedIssues) {
  return {
    checks: [
      { name: 'routes', status: 'warn' },
      { name: 'naming', status: 'pass' },
      { name: 'bindings', status: 'warn' },
      { name: 'registration', status: 'pass' },
    ],
    issues,
    summary: { failed: 0 },
  }
}

describe('framework check warning contract', () => {
  test('accepts only the exact reviewed diagnostics', () => {
    expect(() => verifyFrameworkCheckReport(reviewedReport())).not.toThrow()
  })

  test('rejects a new warning even when the CLI exits successfully', () => {
    expect(() =>
      verifyFrameworkCheckReport(
        reviewedReport([
          ...reviewedIssues,
          { type: 'warning', message: 'A new architecture warning' },
        ])
      )
    ).toThrow(UnexpectedFrameworkCheckReport)
  })

  test('rejects a missing reviewed diagnostic', () => {
    expect(() =>
      verifyFrameworkCheckReport(reviewedReport(reviewedIssues.slice(1)))
    ).toThrow(UnexpectedFrameworkCheckReport)
  })
})
