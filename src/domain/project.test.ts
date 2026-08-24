import { describe, expect, test } from 'bun:test'
import { Effect, Exit, Schema as S } from 'effect'

import {
  CreateProjectInput,
  DeleteProjectInput,
  Project,
  ProjectParams,
  StoredProject,
  UpdateProjectInput,
} from '~/domain/project'
import {
  ProjectApiIndexResponse,
  toProjectDetail,
  toPublicProject,
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

  test('decodes the submitted project revision for optimistic updates', async () => {
    const input = await Effect.runPromise(
      S.decodeUnknownEffect(UpdateProjectInput)({
        name: 'Updated launch site',
        description: '',
        visibility: 'private',
        expectedRevision: '7',
      })
    )
    const invalidRevision = await Effect.runPromiseExit(
      S.decodeUnknownEffect(UpdateProjectInput)({
        name: 'Updated launch site',
        description: '',
        visibility: 'private',
        expectedRevision: 'not-a-revision',
      })
    )

    expect(Number(input.expectedRevision)).toBe(7)
    expect(Exit.isFailure(invalidRevision)).toBe(true)
  })

  test('requires a valid submitted revision for deletion', async () => {
    const input = await Effect.runPromise(
      S.decodeUnknownEffect(DeleteProjectInput)({ expectedRevision: '7' })
    )
    const missingRevision = await Effect.runPromiseExit(
      S.decodeUnknownEffect(DeleteProjectInput)({})
    )

    expect(Number(input.expectedRevision)).toBe(7)
    expect(Exit.isFailure(missingRevision)).toBe(true)
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
        revision: 3,
        createdAt: new Date('2026-08-19T09:00:00.000Z'),
        updatedAt: new Date('2026-08-19T10:00:00.000Z'),
        deletedAt: null,
      })
    )

    const detail = toProjectDetail(stored)

    expect(detail).toEqual({
      id: stored.id,
      name: 'Launch site',
      description: 'Public product notes',
      visibility: 'public',
      revision: stored.revision,
      createdAt: '2026-08-19T09:00:00.000Z',
      updatedAt: '2026-08-19T10:00:00.000Z',
    })
    expect('userId' in detail).toBe(false)

    const response = await Effect.runPromise(
      S.decodeUnknownEffect(ProjectApiIndexResponse)({ projects: [detail] })
    )
    expect(response.projects).toHaveLength(1)

    const publicProject = toPublicProject({
      ...stored,
      visibility: 'public',
    })
    expect(publicProject).toEqual({
      id: stored.id,
      name: stored.name,
      description: stored.description,
      visibility: 'public',
      updatedAt: '2026-08-19T10:00:00.000Z',
    })
    expect('revision' in publicProject).toBe(false)
    expect('createdAt' in publicProject).toBe(false)
    expect('userId' in publicProject).toBe(false)
  })

  test('distinguishes retired persistence rows from active projects', async () => {
    const retired = await Effect.runPromise(
      S.decodeUnknownEffect(StoredProject)({
        id: projectId,
        userId: 'user-123',
        name: '(deleted)',
        description: '',
        visibility: 'private',
        revision: 4,
        createdAt: new Date('2026-08-19T09:00:00.000Z'),
        updatedAt: new Date('2026-08-19T10:00:00.000Z'),
        deletedAt: new Date('2026-08-19T10:00:00.000Z'),
      })
    )
    const activeExit = await Effect.runPromiseExit(
      S.decodeUnknownEffect(Project)(retired)
    )

    expect(retired.deletedAt).toBeInstanceOf(Date)
    expect(Exit.isFailure(activeExit)).toBe(true)
  })
})
