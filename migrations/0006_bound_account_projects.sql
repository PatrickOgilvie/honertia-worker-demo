-- Active reads and lifetime retirement storage are both bounded per account.
-- Counting active and retired rows prevents create/delete churn from growing
-- D1 indefinitely while preserving retry-safe project identifiers.
CREATE TRIGGER projects_lifetime_quota
BEFORE INSERT ON projects
WHEN NOT EXISTS (
  SELECT 1
  FROM projects
  WHERE projects.id = NEW.id
) AND (
  SELECT COUNT(*)
  FROM projects
  WHERE projects.user_id = NEW.user_id
) >= 100
BEGIN
  SELECT RAISE(ABORT, 'project lifetime quota exceeded');
END;

CREATE INDEX idx_projects_owner_active_order
ON projects(user_id, deleted_at, updated_at DESC, id DESC);
