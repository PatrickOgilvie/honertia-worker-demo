import { describe, expect, test } from 'bun:test'
import { Clock, Effect, Layer, Option, Schema as S } from 'effect'

import {
  CreateProjectOutcome,
  DeleteProjectOutcome,
  ProjectMutationCancelled,
  ProjectLifetimeLimitReached,
  ProjectReadCancelled,
  Projects,
  ProjectsLive,
  ProjectStore,
  ProjectInsertOutcome,
  ProjectUpdateOutcome,
  type NewStoredProject,
  type ProjectActor,
  type StoredProjectUpdate,
} from '~/application/projects'
import { UserId } from '~/domain/identity'
import {
  CreateProjectInput,
  Project,
  ProjectId,
  ProjectRevision,
  UpdateProjectInput,
  type Project as ProjectValue,
} from '~/domain/project'

const ownerId = S.decodeUnknownSync(UserId)('owner-1')
const otherOwnerId = S.decodeUnknownSync(UserId)('owner-2')
const firstId = S.decodeUnknownSync(ProjectId)(
  '550e8400-e29b-41d4-a716-446655440000'
)
const secondId = S.decodeUnknownSync(ProjectId)(
  '660e8400-e29b-41d4-a716-446655440000'
)
const thirdId = S.decodeUnknownSync(ProjectId)(
  '770e8400-e29b-41d4-a716-446655440000'
)
const fixedNow = new Date('2026-08-19T12:00:00.000Z')
const firstRevision = S.decodeUnknownSync(ProjectRevision)(1)

const actor: ProjectActor = { userId: ownerId }
const otherActor: ProjectActor = { userId: otherOwnerId }

function makeProject(input: {
  readonly id: typeof firstId
  readonly userId: typeof ownerId
  readonly name: string
  readonly revision?: number
  readonly updatedAt?: Date
}): ProjectValue {
  return S.decodeUnknownSync(Project)({
    id: input.id,
    userId: input.userId,
    name: input.name,
    description: '',
    visibility: 'private',
    revision: input.revision ?? 1,
    createdAt: new Date('2026-08-19T09:00:00.000Z'),
    updatedAt: input.updatedAt ?? new Date('2026-08-19T10:00:00.000Z'),
    deletedAt: null,
  })
}

function makeCreateInput(id: typeof firstId, name: string) {
  return S.decodeUnknownSync(CreateProjectInput)({
    id,
    name,
    description: '',
    visibility: 'private',
  })
}

function makeUpdateInput(name: string, expectedRevision = 1) {
  return S.decodeUnknownSync(UpdateProjectInput)({
    name,
    description: 'Updated',
    visibility: 'public',
    expectedRevision,
  })
}

function makeClock(now: Date): Clock.Clock {
  const millis = now.getTime()
  const nanos = BigInt(millis) * 1_000_000n

  return {
    currentTimeMillisUnsafe: () => millis,
    currentTimeMillis: Effect.succeed(millis),
    currentTimeNanosUnsafe: () => nanos,
    currentTimeNanos: Effect.succeed(nanos),
    monotonicTimeNanosUnsafe: () => nanos,
    monotonicTimeNanos: Effect.succeed(nanos),
    sleep: () => Effect.void,
  }
}

function makeInfrastructure(
  initialProjects: ReadonlyArray<ProjectValue> = [],
  options: {
    readonly afterInsert?: () => void
    readonly afterFindOwned?: () => void
    readonly afterListOwned?: () => void
    readonly afterUpdate?: () => void
    readonly afterUpdateAttempt?: () => void
    readonly afterDelete?: () => void
    readonly afterDeleteAttempt?: () => void
    readonly deleteAfterOwnerProof?: boolean
    readonly forceUpdateConflict?: boolean
    readonly forceDeleteConflict?: boolean
    readonly lifetimeLimitReached?: boolean
  } = {}
) {
  const state = {
    projects: [...initialProjects],
    retiredIds: new Set<string>(),
    listOwnedCalls: 0,
  }

  const store = ProjectStore.of({
    listOwned: (requestedOwnerId) =>
      Effect.sync(() => {
        state.listOwnedCalls += 1
        const projects = state.projects
          .filter((project) => project.userId === requestedOwnerId)
          .slice()
          .sort(
            (left, right) =>
              right.updatedAt.getTime() - left.updatedAt.getTime()
          )
        options.afterListOwned?.()
        return projects
      }),
    findOwned: (requestedOwnerId, id) =>
      Effect.sync(() => {
        const found = Option.fromUndefinedOr(
          state.projects.find(
            (project) =>
              project.id === id && project.userId === requestedOwnerId
          )
        )
        if (Option.isSome(found) && options.deleteAfterOwnerProof === true) {
          state.projects = state.projects.filter(
            (project) =>
              project.id !== id || project.userId !== requestedOwnerId
          )
          state.retiredIds.add(id)
        }
        options.afterFindOwned?.()
        return found
      }),
    insert: (input: NewStoredProject) =>
      Effect.sync(() => {
        const existing = state.projects.some(
          (project) => project.id === input.id
        )
        if (existing || state.retiredIds.has(input.id)) {
          options.afterInsert?.()
          return ProjectInsertOutcome.Conflict()
        }
        if (options.lifetimeLimitReached === true) {
          options.afterInsert?.()
          return ProjectInsertOutcome.LimitReached()
        }

        const project: ProjectValue = {
          id: input.id,
          userId: input.userId,
          name: input.name,
          description: input.description,
          visibility: input.visibility,
          revision: input.revision,
          createdAt: input.createdAt,
          updatedAt: input.updatedAt,
          deletedAt: input.deletedAt,
        }
        state.projects.push(project)
        options.afterInsert?.()
        return ProjectInsertOutcome.Inserted()
      }),
    updateOwned: (input: StoredProjectUpdate) =>
      Effect.sync(() => {
        const index = state.projects.findIndex(
          (project) =>
            project.id === input.id && project.userId === input.ownerId
        )
        const current = state.projects[index]
        if (
          options.forceUpdateConflict === true ||
          current === undefined ||
          current.revision !== input.expectedRevision
        ) {
          options.afterUpdateAttempt?.()
          return ProjectUpdateOutcome.Conflict()
        }

        const project: ProjectValue = {
          id: current.id,
          userId: current.userId,
          name: input.name,
          description: input.description,
          visibility: input.visibility,
          revision: input.revision,
          createdAt: current.createdAt,
          updatedAt: input.updatedAt,
          deletedAt: null,
        }
        state.projects[index] = project
        options.afterUpdate?.()
        options.afterUpdateAttempt?.()
        return ProjectUpdateOutcome.Updated()
      }),
    deleteOwned: (requestedOwnerId, id, expectedRevision) =>
      Effect.sync(() => {
        const index = state.projects.findIndex(
          (project) =>
            project.id === id && project.userId === requestedOwnerId
        )
        const current = state.projects[index]
        if (
          options.forceDeleteConflict === true ||
          current === undefined ||
          current.revision !== expectedRevision
        ) {
          options.afterDeleteAttempt?.()
          return DeleteProjectOutcome.AlreadyAbsent()
        }

        state.projects.splice(index, 1)
        state.retiredIds.add(id)
        options.afterDelete?.()
        options.afterDeleteAttempt?.()
        return DeleteProjectOutcome.Deleted()
      }),
  })

  return {
    state,
    layer: Layer.succeed(ProjectStore, store),
  }
}

function runProjectEffect<A, E>(
  effect: Effect.Effect<A, E, Projects>,
  infrastructure: ReturnType<typeof makeInfrastructure>
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(
      Effect.provide(ProjectsLive),
      Effect.provide(infrastructure.layer),
      Effect.provideService(Clock.Clock, makeClock(fixedNow))
    )
  )
}

describe('Projects application service', () => {
  test('returns only the actor owner scope in latest-first order', async () => {
    const infrastructure = makeInfrastructure([
      makeProject({
        id: thirdId,
        userId: ownerId,
        name: 'Older',
      }),
      makeProject({
        id: secondId,
        userId: ownerId,
        name: 'Newer',
        updatedAt: new Date('2026-08-19T11:00:00.000Z'),
      }),
      makeProject({
        id: firstId,
        userId: otherOwnerId,
        name: 'Other owner',
      }),
    ])

    const result = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* projects.listOwned(actor)
      }),
      infrastructure
    )

    expect(result.map(({ project }) => project.name)).toEqual([
      'Newer',
      'Older',
    ])
    expect(result.every(({ ownerId: id }) => id === ownerId)).toBe(true)
  })

  test('creates once and replays the first write', async () => {
    const infrastructure = makeInfrastructure()

    const result = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        const created = yield* projects.create(
          actor,
          makeCreateInput(firstId, 'Original')
        )
        const replayed = yield* projects.create(
          actor,
          makeCreateInput(firstId, 'Delayed retry')
        )
        return { created, replayed }
      }),
      infrastructure
    )

    expect(CreateProjectOutcome.$is('Created')(result.created)).toBe(true)
    expect(CreateProjectOutcome.$is('Replayed')(result.replayed)).toBe(true)
    expect(result.replayed.project.project.name).toBe('Original')
    expect(result.replayed.project.project.createdAt).toEqual(fixedNow)
    expect(Number(result.replayed.project.project.revision)).toBe(1)
    expect(infrastructure.state.projects).toHaveLength(1)
  })

  test('reports a cross-owner identifier conflict', async () => {
    const infrastructure = makeInfrastructure([
      makeProject({
        id: firstId,
        userId: otherOwnerId,
        name: 'Already owned',
      }),
    ])

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.create(actor, makeCreateInput(firstId, 'Collision'))
        )
      }),
      infrastructure
    )

    expect(failure._tag).toBe('ProjectIdConflict')
  })

  test('reports the database-enforced lifetime project limit', async () => {
    const infrastructure = makeInfrastructure([], {
      lifetimeLimitReached: true,
    })

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.create(actor, makeCreateInput(firstId, 'One too many'))
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectLifetimeLimitReached)
    if (!(failure instanceof ProjectLifetimeLimitReached)) {
      throw new Error('Expected the project lifetime limit')
    }
    expect(failure.limit).toBe(100)
    expect(infrastructure.state.projects).toHaveLength(0)
  })

  test('updates atomically with Effect-owned time and conceals non-owned projects', async () => {
    const infrastructure = makeInfrastructure([
      makeProject({
        id: firstId,
        userId: ownerId,
        name: 'Before',
      }),
    ])

    const updated = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* projects.update(
          actor,
          firstId,
          makeUpdateInput('After')
        )
      }),
      infrastructure
    )
    const hidden = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(projects.getOwned(otherActor, firstId))
      }),
      infrastructure
    )

    expect(updated.project.name).toBe('After')
    expect(updated.project.updatedAt).toEqual(fixedNow)
    expect(Number(updated.project.revision)).toBe(2)
    expect(hidden._tag).toBe('ProjectNotFound')
  })

  test('advances revisions across successful updates in the same clock tick', async () => {
    const infrastructure = makeInfrastructure([
      makeProject({ id: firstId, userId: ownerId, name: 'Before' }),
    ])

    const result = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        const first = yield* projects.update(
          actor,
          firstId,
          makeUpdateInput('First', 1)
        )
        const second = yield* projects.update(
          actor,
          firstId,
          makeUpdateInput('Second', 2)
        )
        const stale = yield* Effect.flip(
          projects.update(actor, firstId, makeUpdateInput('Stale', 1))
        )
        return { first, second, stale }
      }),
      infrastructure
    )

    expect(Number(result.first.project.revision)).toBe(2)
    expect(Number(result.second.project.revision)).toBe(3)
    expect(result.second.project.updatedAt).toEqual(
      result.first.project.updatedAt
    )
    expect(result.stale._tag).toBe('ProjectUpdateConflict')
    expect(infrastructure.state.projects.at(0)?.name).toBe('Second')
  })

  test('rejects a stale update revision without writing', async () => {
    const infrastructure = makeInfrastructure([
      makeProject({ id: firstId, userId: ownerId, name: 'Current' }),
    ])

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.update(
            actor,
            firstId,
            makeUpdateInput('Stale overwrite', 2)
          )
        )
      }),
      infrastructure
    )

    expect(failure._tag).toBe('ProjectUpdateConflict')
    expect(infrastructure.state.projects.at(0)?.name).toBe('Current')
  })

  test('returns an idempotent outcome for missing or non-owned deletion targets', async () => {
    const infrastructure = makeInfrastructure()

    const outcome = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* projects.remove(actor, firstId, firstRevision)
      }),
      infrastructure
    )

    expect(DeleteProjectOutcome.$is('AlreadyAbsent')(outcome)).toBe(true)
  })

  test('returns an idempotent outcome when a project disappears before deletion', async () => {
    const infrastructure = makeInfrastructure(
      [makeProject({ id: firstId, userId: ownerId, name: 'Concurrent' })],
      { deleteAfterOwnerProof: true }
    )

    const outcome = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* projects.remove(actor, firstId, firstRevision)
      }),
      infrastructure
    )

    expect(DeleteProjectOutcome.$is('AlreadyAbsent')(outcome)).toBe(true)
  })

  test('rejects a stale delete revision without retiring the project', async () => {
    const infrastructure = makeInfrastructure([
      makeProject({
        id: firstId,
        userId: ownerId,
        name: 'Current',
        revision: 2,
      }),
    ])

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.remove(actor, firstId, firstRevision)
        )
      }),
      infrastructure
    )

    expect(failure._tag).toBe('ProjectDeleteConflict')
    expect(infrastructure.state.projects.at(0)?.name).toBe('Current')
    expect(infrastructure.state.retiredIds.has(firstId)).toBe(false)
  })

  test('scrubs a deletion and never reuses its stable identifier', async () => {
    const infrastructure = makeInfrastructure([
      makeProject({ id: firstId, userId: ownerId, name: 'Original' }),
    ])

    const result = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        const deleted = yield* projects.remove(
          actor,
          firstId,
          firstRevision
        )
        const delayedCreate = yield* Effect.flip(
          projects.create(
            actor,
            makeCreateInput(firstId, 'Must not resurrect')
          )
        )
        const delayedUpdate = yield* Effect.flip(
          projects.update(
            actor,
            firstId,
            makeUpdateInput('Must not resurrect', firstRevision)
          )
        )
        return { deleted, delayedCreate, delayedUpdate }
      }),
      infrastructure
    )

    expect(DeleteProjectOutcome.$is('Deleted')(result.deleted)).toBe(true)
    expect(result.delayedCreate._tag).toBe('ProjectIdConflict')
    expect(result.delayedUpdate._tag).toBe('ProjectNotFound')
    expect(infrastructure.state.projects).toHaveLength(0)
    expect(infrastructure.state.retiredIds.has(firstId)).toBe(true)
  })

  test('stops a cancelled read before persistence is consulted', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure()
    controller.abort('private-reason')

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.listOwned(actor, { signal: controller.signal })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectReadCancelled)
    expect(failure.operation).toBe('listOwned')
    expect(JSON.stringify(failure)).not.toContain('private-reason')
    expect(infrastructure.state.listOwnedCalls).toBe(0)
  })

  test('checks cancellation again after an owner-scoped read', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure([], {
      afterListOwned: () => controller.abort(),
    })

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.listOwned(actor, { signal: controller.signal })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectReadCancelled)
    expect(infrastructure.state.listOwnedCalls).toBe(1)
  })

  test('classifies cancellation after an absent update precondition read', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure([], {
      afterFindOwned: () => controller.abort('private-update-read'),
    })

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.update(actor, firstId, makeUpdateInput('Never written'), {
            signal: controller.signal,
          })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectMutationCancelled)
    if (!(failure instanceof ProjectMutationCancelled)) {
      throw new Error('Expected cancellation after update precondition read')
    }
    expect(failure.operation).toBe('update')
    expect(failure.mutationCommitted).toBe(false)
    expect(JSON.stringify(failure)).not.toContain('private-update-read')
  })

  test('classifies cancellation after a delete precondition read', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure([], {
      afterFindOwned: () => controller.abort('private-delete-read'),
    })

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.remove(actor, firstId, firstRevision, {
            signal: controller.signal,
          })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectMutationCancelled)
    if (!(failure instanceof ProjectMutationCancelled)) {
      throw new Error('Expected cancellation after delete precondition read')
    }
    expect(failure.operation).toBe('remove')
    expect(failure.mutationCommitted).toBe(false)
    expect(JSON.stringify(failure)).not.toContain('private-delete-read')
  })

  test('reports cancellation after a committed create', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure([], {
      afterInsert: () => controller.abort('private-reason'),
    })

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.create(actor, makeCreateInput(firstId, 'Committed'), {
            signal: controller.signal,
          })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectMutationCancelled)
    if (!(failure instanceof ProjectMutationCancelled)) {
      throw new Error('Expected committed creation cancellation')
    }
    expect(failure.operation).toBe('create')
    expect(failure.mutationCommitted).toBe(true)
    expect(JSON.stringify(failure)).not.toContain('private-reason')
    expect(infrastructure.state.projects).toHaveLength(1)
  })

  test('reports a cancelled replay as uncommitted', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure(
      [
        makeProject({
          id: firstId,
          userId: ownerId,
          name: 'Original',
        }),
      ],
      {
        afterInsert: () => controller.abort(),
      }
    )

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.create(actor, makeCreateInput(firstId, 'Retry'), {
            signal: controller.signal,
          })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectMutationCancelled)
    if (!(failure instanceof ProjectMutationCancelled)) {
      throw new Error('Expected replay cancellation')
    }
    expect(failure.operation).toBe('create')
    expect(failure.mutationCommitted).toBe(false)
    expect(infrastructure.state.projects).toHaveLength(1)
  })

  test('reports cancellation after a committed update', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure(
      [makeProject({ id: firstId, userId: ownerId, name: 'Before' })],
      { afterUpdate: () => controller.abort('private-update-reason') }
    )

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.update(actor, firstId, makeUpdateInput('After'), {
            signal: controller.signal,
          })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectMutationCancelled)
    if (!(failure instanceof ProjectMutationCancelled)) {
      throw new Error('Expected committed update cancellation')
    }
    expect(failure.operation).toBe('update')
    expect(failure.mutationCommitted).toBe(true)
    expect(JSON.stringify(failure)).not.toContain('private-update-reason')
    expect(infrastructure.state.projects.at(0)?.name).toBe('After')
  })

  test('classifies cancellation after a failed update compare-and-swap', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure(
      [makeProject({ id: firstId, userId: ownerId, name: 'Before' })],
      {
        forceUpdateConflict: true,
        afterUpdateAttempt: () => controller.abort('private-cas-reason'),
      }
    )

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.update(actor, firstId, makeUpdateInput('After'), {
            signal: controller.signal,
          })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectMutationCancelled)
    if (!(failure instanceof ProjectMutationCancelled)) {
      throw new Error('Expected failed update cancellation')
    }
    expect(failure.operation).toBe('update')
    expect(failure.mutationCommitted).toBe(false)
    expect(JSON.stringify(failure)).not.toContain('private-cas-reason')
    expect(infrastructure.state.projects.at(0)?.name).toBe('Before')
  })

  test('reports cancellation after a committed delete', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure(
      [makeProject({ id: firstId, userId: ownerId, name: 'Delete me' })],
      { afterDelete: () => controller.abort('private-delete-reason') }
    )

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.remove(actor, firstId, firstRevision, {
            signal: controller.signal,
          })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectMutationCancelled)
    if (!(failure instanceof ProjectMutationCancelled)) {
      throw new Error('Expected committed delete cancellation')
    }
    expect(failure.operation).toBe('remove')
    expect(failure.mutationCommitted).toBe(true)
    expect(JSON.stringify(failure)).not.toContain('private-delete-reason')
    expect(infrastructure.state.projects).toHaveLength(0)
  })

  test('classifies cancellation after a zero-row delete attempt', async () => {
    const controller = new AbortController()
    const infrastructure = makeInfrastructure(
      [makeProject({ id: firstId, userId: ownerId, name: 'Keep me' })],
      {
        forceDeleteConflict: true,
        afterDeleteAttempt: () => controller.abort('private-delete-cas'),
      }
    )

    const failure = await runProjectEffect(
      Effect.gen(function* () {
        const projects = yield* Projects
        return yield* Effect.flip(
          projects.remove(actor, firstId, firstRevision, {
            signal: controller.signal,
          })
        )
      }),
      infrastructure
    )

    expect(failure).toBeInstanceOf(ProjectMutationCancelled)
    if (!(failure instanceof ProjectMutationCancelled)) {
      throw new Error('Expected failed delete cancellation')
    }
    expect(failure.operation).toBe('remove')
    expect(failure.mutationCommitted).toBe(false)
    expect(JSON.stringify(failure)).not.toContain('private-delete-cas')
    expect(infrastructure.state.projects).toHaveLength(1)
  })
})
