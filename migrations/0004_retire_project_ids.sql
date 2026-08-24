ALTER TABLE projects
ADD COLUMN deleted_at INTEGER;

CREATE TRIGGER projects_retired_state_insert
BEFORE INSERT ON projects
WHEN NEW.deleted_at IS NOT NULL
  AND (
    NEW.visibility <> 'private'
    OR NEW.name <> '(deleted)'
    OR NEW.description <> ''
  )
BEGIN
  SELECT RAISE(ABORT, 'invalid retired project state');
END;

CREATE TRIGGER projects_retired_state_update
BEFORE UPDATE ON projects
WHEN (
  OLD.deleted_at IS NOT NULL
  AND NEW.deleted_at IS NULL
) OR (
  NEW.deleted_at IS NOT NULL
  AND (
    NEW.visibility <> 'private'
    OR NEW.name <> '(deleted)'
    OR NEW.description <> ''
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid project retirement transition');
END;

-- Project identifiers are durable retirement records for the lifetime of an
-- account. Application code retires rows in place; only the owning account's
-- foreign-key cascade may physically remove them.
CREATE TRIGGER projects_delete_guard
BEFORE DELETE ON projects
WHEN EXISTS (
  SELECT 1
  FROM users
  WHERE users.id = OLD.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'projects must be retired before deletion');
END;
