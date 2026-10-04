-- Session hardening.
--
-- Two changes:
--
--   1. `last_seen_at` tracks per-request activity so the idle window can be
--      enforced without rewriting `expires_at` on every single request (the
--      sliding refresh only fires once an hour, see touch_session()).
--   2. `login_attempts` is a queryable audit log of sign-in attempts. It backs
--      the login throttle (auth.php) so brute force is both rate limited and
--      inspectable after the fact.
--
-- Existing rows carry no activity data, so last_seen_at starts at created_at.

ALTER TABLE sessions ADD COLUMN last_seen_at TEXT NOT NULL DEFAULT '';

UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at = '';

-- Pre-0023 sessions were minted with a flat 30-day expiry. Clamp them to the
-- new absolute lifetime so upgrading an existing install actually shortens
-- the sessions that are already in the wild.
UPDATE sessions
   SET expires_at = datetime(created_at, '+7 days')
 WHERE expires_at > datetime(created_at, '+7 days');

CREATE TABLE login_attempts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT    NOT NULL DEFAULT '',
    ip         TEXT    NOT NULL DEFAULT '',
    user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ok         INTEGER NOT NULL DEFAULT 0,
    user_agent TEXT    NOT NULL DEFAULT '',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_login_attempts_username ON login_attempts(lower(username));
CREATE INDEX idx_login_attempts_ip ON login_attempts(ip);
CREATE INDEX idx_login_attempts_created ON login_attempts(created_at);