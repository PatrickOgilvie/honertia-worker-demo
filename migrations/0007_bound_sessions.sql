-- Keep Better Auth's complete per-user session collection bounded before the
-- application code that relies on this invariant is deployed.
DELETE FROM sessions
WHERE id IN (
  SELECT id
  FROM (
    SELECT
      id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY created_at DESC, id DESC
      ) AS session_rank
    FROM sessions
  ) ranked_sessions
  WHERE session_rank > 5
);

CREATE INDEX idx_sessions_owner_created_id
ON sessions(user_id, created_at DESC, id DESC);

-- Always retain the inserted row, then retain the newest four other rows for
-- its owner. Expired rows count toward the cap so the stored collection itself
-- cannot grow without bound.
CREATE TRIGGER sessions_limit_after_insert
AFTER INSERT ON sessions
BEGIN
  DELETE FROM sessions
  WHERE sessions.user_id = NEW.user_id
    AND sessions.id <> NEW.id
    AND sessions.id NOT IN (
      SELECT id
      FROM sessions
      WHERE sessions.user_id = NEW.user_id
        AND sessions.id <> NEW.id
      ORDER BY created_at DESC, id DESC
      LIMIT 4
    );
END;
