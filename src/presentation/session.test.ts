import { describe, expect, test } from 'bun:test'
import { Effect, Exit, Schema as S } from 'effect'

import { ManagedSession } from '~/domain/session'
import {
  SessionSummary,
  toSessionSummary,
} from '~/presentation/session'

describe('session presentation', () => {
  test('projects only browser-safe session fields', async () => {
    const managed = await Effect.runPromise(
      S.decodeUnknownEffect(ManagedSession)({
        id: 'session-current',
        createdAt: new Date('2026-08-19T09:00:00.000Z'),
        updatedAt: new Date('2026-08-19T10:00:00.000Z'),
        expiresAt: new Date('2026-08-26T09:00:00.000Z'),
        ipAddress: null,
        userAgent: 'Browser',
        isCurrent: true,
      })
    )

    const summary = toSessionSummary(managed)

    expect(summary).toEqual({
      id: managed.id,
      createdAt: '2026-08-19T09:00:00.000Z',
      updatedAt: '2026-08-19T10:00:00.000Z',
      expiresAt: '2026-08-26T09:00:00.000Z',
      ipAddress: null,
      userAgent: 'Browser',
      isCurrent: true,
    })
    expect('token' in summary).toBe(false)
    expect('userId' in summary).toBe(false)
  })

  test('rejects secret and owner fields at the strict presentation boundary', async () => {
    const exit = await Effect.runPromiseExit(
      S.decodeUnknownEffect(SessionSummary, {
        onExcessProperty: 'error',
      })({
        id: 'session-current',
        createdAt: '2026-08-19T09:00:00.000Z',
        updatedAt: '2026-08-19T10:00:00.000Z',
        expiresAt: '2026-08-26T09:00:00.000Z',
        ipAddress: null,
        userAgent: null,
        isCurrent: true,
        token: 'must-not-cross-the-boundary',
        userId: 'user-123',
      })
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })
})
