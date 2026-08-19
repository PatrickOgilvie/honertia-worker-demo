import { describe, expect, test } from 'bun:test'
import { Effect, Exit, Schema as S } from 'effect'

import { CreateProjectInput, Project, ProjectParams } from '~/domain/project'
import {
  ProjectApiIndexResponse,
  toProjectDetail,
} from '~/presentation/project'

const projectId = '550e8400-e29b-41d4-a716-446655440000'

describe('project boundaries', () => {
  test('normalizes a valid create command', async () => {
    const input = await Effect.runPromise(
      S.decodeUnknownEffect(CreateProjectInput, {
        onExcessProperty: 'error',
      })({
        id: projectId,
        name: '  Launch site  ',
        description: '  Public product notes  ',
        visibility: 'public',
      })
    )

    expect(String(input.id)).toBe(projectId)
    expect(input.name).toBe('Launch site')
    expect(input.description).toBe('Public product notes')
    expect(input.visibility).toBe('public')
  })

  test('rejects undeclared mutation fields', async () => {
    const exit = await Effect.runPromiseExit(
      S.decodeUnknownEffect(CreateProjectInput, {
        onExcessProperty: 'error',
      })({
        id: projectId,
        name: 'Launch site',
        description: '',
        visibility: 'private',
        userId: 'attacker-controlled-owner',
      })
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  test('rejects malformed route identifiers before model binding', async () => {
    const exit = await Effect.runPromiseExit(
      S.decodeUnknownEffect(ProjectParams)({ project: 'not-a-uuid' })
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  test('enforces wire-level length limits before normalization', async () => {
    const exit = await Effect.runPromiseExit(
      S.decodeUnknownEffect(CreateProjectInput)({
        id: projectId,
        name: ` ${'a'.repeat(100)} `,
        description: '',
        visibility: 'private',
      })
    )

    expect(Exit.isFailure(exit)).toBe(true)
  })

  test('projects are parsed from storage before their public projection', async () => {
    const stored = await Effect.runPromise(
      S.decodeUnknownEffect(Project)({
        id: projectId,
        userId: 'user-123',
        name: 'Launch site',
        description: 'Public product notes',
        visibility: 'public',
        createdAt: new Date('2026-08-19T09:00:00.000Z'),
        updatedAt: new Date('2026-08-19T10:00:00.000Z'),
      })
    )

    const detail = toProjectDetail(stored)

    expect(detail).toEqual({
      id: projectId,
      name: 'Launch site',
      description: 'Public product notes',
      visibility: 'public',
      createdAt: '2026-08-19T09:00:00.000Z',
      updatedAt: '2026-08-19T10:00:00.000Z',
    })
    expect('userId' in detail).toBe(false)

    const response = await Effect.runPromise(
      S.decodeUnknownEffect(ProjectApiIndexResponse)({ projects: [detail] })
    )
    expect(response.projects).toHaveLength(1)
  })
})
