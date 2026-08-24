import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migrationNames = [
  '0000_initial.sql',
  '0001_projects.sql',
  '0002_rate_limits.sql',
  '0003_project_revisions.sql',
  '0004_retire_project_ids.sql',
  '0005_index_rate_limit_cleanup.sql',
  '0006_bound_account_projects.sql',
  '0007_bound_sessions.sql',
] as const

function migrate(
  database: Database,
  names: ReadonlyArray<(typeof migrationNames)[number]>
): void {
  for (const name of names) {
    database.exec(
      readFileSync(join(import.meta.dir, '..', 'migrations', name), 'utf8')
    )
  }
}

function withDatabase(run: (database: Database) => void): void {
  const database = new Database(':memory:')
  database.exec('PRAGMA foreign_keys = ON')
  try {
    run(database)
  } finally {
    database.close()
  }
}

function insertUser(database: Database, id = 'owner-1'): void {
  database
    .prepare(
      'INSERT INTO users (id, email, created_at, updated_at) VALUES (?, ?, ?, ?)'
    )
    .run(id, `${id}@example.com`, 1_776_768_000, 1_776_768_000)
}

function insertSession(
  database: Database,
  id: string,
  ownerId = 'owner-1',
  createdAt = 1_776_768_000
): void {
  database
    .prepare(
      'INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(id, ownerId, `${id}-token`, 1, createdAt, createdAt)
}

describe('database migrations', () => {
  test('preserves legacy second timestamps while adding revisions', () => {
    withDatabase((database) => {
      migrate(database, migrationNames.slice(0, 2))
      insertUser(database)
      database
        .prepare(
          'INSERT INTO projects (id, user_id, name, description, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(
          'project-1',
          'owner-1',
          'Legacy',
          '',
          'private',
          1_776_768_001,
          1_776_768_002
        )

      migrate(database, migrationNames.slice(2))

      expect(
        database
          .query(
            'SELECT created_at, updated_at, revision FROM projects WHERE id = ?'
          )
          .get('project-1')
      ).toEqual({
        created_at: 1_776_768_001,
        updated_at: 1_776_768_002,
        revision: 1,
      })
    })
  })

  test('guards durable project identifiers but permits account cascades', () => {
    withDatabase((database) => {
      migrate(database, migrationNames)
      insertUser(database)
      database
        .prepare(
          'INSERT INTO projects (id, user_id, name, description, visibility, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run('project-1', 'owner-1', 'Active', '', 'private', 1, 1)

      expect(() =>
        database.exec("DELETE FROM projects WHERE id = 'project-1'")
      ).toThrow('projects must be retired before deletion')
      expect(
        database.query('SELECT COUNT(*) AS count FROM projects').get()
      ).toEqual({ count: 1 })

      database.exec("DELETE FROM users WHERE id = 'owner-1'")
      expect(
        database.query('SELECT COUNT(*) AS count FROM projects').get()
      ).toEqual({ count: 0 })
    })
  })

  test('enforces safe revisions and the lifetime identifier quota', () => {
    withDatabase((database) => {
      migrate(database, migrationNames)
      insertUser(database)
      const insert = database.prepare(
        'INSERT INTO projects (id, user_id, name, description, visibility, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )

      expect(() =>
        insert.run(
          'unsafe-revision',
          'owner-1',
          'Unsafe',
          '',
          'private',
          9_007_199_254_740_992,
          1,
          1
        )
      ).toThrow()

      for (let index = 0; index < 100; index += 1) {
        insert.run(
          `project-${index}`,
          'owner-1',
          `Project ${index}`,
          '',
          'private',
          1,
          index + 1,
          index + 1
        )
      }

      expect(() =>
        insert.run(
          'project-101',
          'owner-1',
          'Over limit',
          '',
          'private',
          1,
          101,
          101
        )
      ).toThrow('project lifetime quota exceeded')

      expect(() =>
        database.exec(
          "INSERT INTO projects (id, user_id, name, description, visibility, revision, created_at, updated_at) VALUES ('project-0', 'owner-1', 'Retry', '', 'private', 1, 1, 1) ON CONFLICT(id) DO NOTHING"
        )
      ).not.toThrow()

      database.exec(
        "UPDATE projects SET name = '(deleted)', description = '', visibility = 'private', deleted_at = 200, updated_at = 200 WHERE id = 'project-0'"
      )
      expect(() =>
        insert.run(
          'project-102',
          'owner-1',
          'Still over lifetime limit',
          '',
          'private',
          1,
          102,
          102
        )
      ).toThrow('project lifetime quota exceeded')
    })
  })

  test('trims legacy sessions and keeps every owner collection bounded', () => {
    withDatabase((database) => {
      migrate(database, migrationNames.slice(0, -1))
      insertUser(database)
      insertUser(database, 'owner-2')

      for (let index = 0; index < 7; index += 1) {
        insertSession(database, `session-${index}`)
      }
      insertSession(database, 'owner-2-session-1', 'owner-2')
      insertSession(database, 'owner-2-session-2', 'owner-2')

      migrate(database, migrationNames.slice(-1))

      expect(
        database
          .query(
            "SELECT id FROM sessions WHERE user_id = 'owner-1' ORDER BY created_at DESC, id DESC"
          )
          .all()
      ).toEqual([
        { id: 'session-6' },
        { id: 'session-5' },
        { id: 'session-4' },
        { id: 'session-3' },
        { id: 'session-2' },
      ])
      expect(
        database
          .query("SELECT COUNT(*) AS count FROM sessions WHERE user_id = 'owner-2'")
          .get()
      ).toEqual({ count: 2 })
      expect(
        database
          .query(
            "SELECT name, desc FROM pragma_index_xinfo('idx_sessions_owner_created_id') WHERE key = 1 ORDER BY seqno"
          )
          .all()
      ).toEqual([
        { name: 'user_id', desc: 0 },
        { name: 'created_at', desc: 1 },
        { name: 'id', desc: 1 },
      ])

      // The new row remains valid even when its timestamp sorts behind all of
      // the owner's existing rows, and expired rows still consume the cap.
      insertSession(database, 'session-inserted', 'owner-1', 1)
      expect(
        database
          .query(
            "SELECT id FROM sessions WHERE user_id = 'owner-1' ORDER BY created_at DESC, id DESC"
          )
          .all()
      ).toEqual([
        { id: 'session-6' },
        { id: 'session-5' },
        { id: 'session-4' },
        { id: 'session-3' },
        { id: 'session-inserted' },
      ])

      insertSession(database, 'session-latest', 'owner-1', 1_776_768_001)
      expect(
        database
          .query(
            "SELECT id FROM sessions WHERE user_id = 'owner-1' ORDER BY created_at DESC, id DESC"
          )
          .all()
      ).toEqual([
        { id: 'session-latest' },
        { id: 'session-6' },
        { id: 'session-5' },
        { id: 'session-4' },
        { id: 'session-3' },
      ])
    })
  })
})
