import { and, desc, eq, isNull } from 'drizzle-orm'
import { Effect, Layer, Option, Schema as S } from 'effect'

import { DatabaseService } from '@popcomputer/web/effect'
import {
  DeleteProjectOutcome,
  InvalidStoredProject,
  type NewStoredProject,
  ProjectInsertOutcome,
  ProjectStore,
  ProjectStoreUnavailable,
  ProjectUpdateOutcome,
  type StoredProjectUpdate,
  UnexpectedProjectStoreResult,
} from '~/application/projects'
import { projects } from '~/db/schema'
import {
  Project,
  type ProjectId,
  PROJECT_LIFETIME_LIMIT,
  type ProjectRevision,
} from '~/domain/project'
import type { UserId } from '~/domain/identity'

type StoreOperation =
  | 'listOwned'
  | 'findOwned'
  | 'insert'
  | 'updateOwned'
  | 'deleteOwned'

const PROJECT_QUOTA_DATABASE_MESSAGE = 'project lifetime quota exceeded'

class ProjectQuotaViolation extends S.TaggedError<ProjectQuotaViolation>()(
  'ProjectQuotaViolation',
  {}
) {}

function isProjectQuotaViolation(cause: unknown): boolean {
  const visited = new Set<Error>()
  let candidate = cause

  while (candidate instanceof Error && !visited.has(candidate)) {
    if (candidate.message.includes(PROJECT_QUOTA_DATABASE_MESSAGE)) {
      return true
    }

    visited.add(candidate)
    candidate = candidate.cause
  }

  return (
    typeof candidate === 'string' &&
    candidate.includes(PROJECT_QUOTA_DATABASE_MESSAGE)
  )
}

function runQuery<A>(
  operation: StoreOperation,
  query: () => PromiseLike<A>
): Effect.Effect<A, ProjectStoreUnavailable> {
  return Effect.tryPromise({
    try: () => Promise.resolve(query()),
    catch: () => new ProjectStoreUnavailable({ operation }),
  })
}

function parseProjectRows(
  operation: StoreOperation,
  rows: ReadonlyArray<unknown>
): Effect.Effect<ReadonlyArray<Project>, InvalidStoredProject> {
  return Effect.forEach(rows, (row, rowIndex) =>
    S.decodeUnknownEffect(Project)(row).pipe(
      Effect.mapError(() => new InvalidStoredProject({ operation, rowIndex }))
    )
  )
}

function atMostOne<A>(
  operation: StoreOperation,
  rows: ReadonlyArray<A>
): Effect.Effect<Option.Option<A>, UnexpectedProjectStoreResult> {
  if (rows.length > 1) {
    return Effect.fail(
      new UnexpectedProjectStoreResult({
        operation,
        expectedMaximum: 1,
        actual: rows.length,
      })
    )
  }

  return Effect.succeed(Option.fromIterable(rows))
}

/** D1-backed owner-scoped project persistence using the request's Drizzle database. */
export const D1ProjectStoreLive = Layer.effect(
  ProjectStore,
  Effect.gen(function* () {
    const db = yield* DatabaseService

    const listOwned = Effect.fn('D1ProjectStore.listOwned')(
      function* (ownerId: UserId) {
        const rows = yield* runQuery('listOwned', () =>
          db
            .select()
            .from(projects)
            .where(
              and(
                eq(projects.userId, ownerId),
                isNull(projects.deletedAt)
              )
            )
            .orderBy(desc(projects.updatedAt), desc(projects.id))
            .limit(PROJECT_LIFETIME_LIMIT)
        )

        return yield* parseProjectRows('listOwned', rows)
      }
    )

    const findOwned = Effect.fn('D1ProjectStore.findOwned')(
      function* (ownerId: UserId, id: ProjectId) {
        const rows = yield* runQuery('findOwned', () =>
          db
            .select()
            .from(projects)
            .where(
              and(
                eq(projects.id, id),
                eq(projects.userId, ownerId),
                isNull(projects.deletedAt)
              )
            )
            .limit(1)
        )
        const parsed = yield* parseProjectRows('findOwned', rows)
        return yield* atMostOne('findOwned', parsed)
      }
    )

    const insert = Effect.fn('D1ProjectStore.insert')(
      function* (project: NewStoredProject) {
        const rows = yield* Effect.tryPromise({
          try: () =>
            Promise.resolve(
              db
                .insert(projects)
                .values({
                  id: project.id,
                  userId: project.userId,
                  name: project.name,
                  description: project.description,
                  visibility: project.visibility,
                  revision: project.revision,
                  createdAt: project.createdAt,
                  updatedAt: project.updatedAt,
                  deletedAt: project.deletedAt,
                })
                .onConflictDoNothing({ target: projects.id })
                .returning({ id: projects.id })
            ),
          catch: (cause) =>
            isProjectQuotaViolation(cause)
              ? new ProjectQuotaViolation()
              : new ProjectStoreUnavailable({ operation: 'insert' }),
        }).pipe(
          Effect.catchTag('ProjectQuotaViolation', () =>
            Effect.succeed(null)
          )
        )

        if (rows === null) {
          return ProjectInsertOutcome.LimitReached()
        }

        const inserted = yield* atMostOne('insert', rows)

        return Option.match(inserted, {
          onNone: () => ProjectInsertOutcome.Conflict(),
          onSome: () => ProjectInsertOutcome.Inserted(),
        })
      }
    )

    const updateOwned = Effect.fn('D1ProjectStore.updateOwned')(
      function* (update: StoredProjectUpdate) {
        const rows = yield* runQuery('updateOwned', () =>
          db
            .update(projects)
            .set({
              name: update.name,
              description: update.description,
              visibility: update.visibility,
              revision: update.revision,
              updatedAt: update.updatedAt,
            })
            .where(
              and(
                eq(projects.id, update.id),
                eq(projects.userId, update.ownerId),
                isNull(projects.deletedAt),
                eq(projects.revision, update.expectedRevision)
              )
            )
            .returning({ id: projects.id })
        )
        const updated = yield* atMostOne('updateOwned', rows)
        return Option.isSome(updated)
          ? ProjectUpdateOutcome.Updated()
          : ProjectUpdateOutcome.Conflict()
      }
    )

    const deleteOwned = Effect.fn('D1ProjectStore.deleteOwned')(
      function* (
        ownerId: UserId,
        id: ProjectId,
        expectedRevision: ProjectRevision,
        deletedAt: Date
      ) {
        const rows = yield* runQuery('deleteOwned', () =>
          db
            .update(projects)
            .set({
              name: '(deleted)',
              description: '',
              visibility: 'private',
              updatedAt: deletedAt,
              deletedAt,
            })
            .where(
              and(
                eq(projects.id, id),
                eq(projects.userId, ownerId),
                isNull(projects.deletedAt),
                eq(projects.revision, expectedRevision)
              )
            )
            .returning({ id: projects.id })
        )
        const deleted = yield* atMostOne('deleteOwned', rows)

        return Option.isSome(deleted)
          ? DeleteProjectOutcome.Deleted()
          : DeleteProjectOutcome.AlreadyAbsent()
      }
    )

    return ProjectStore.of({
      listOwned,
      findOwned,
      insert,
      updateOwned,
      deleteOwned,
    })
  })
)
