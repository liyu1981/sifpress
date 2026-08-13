-- The special `_guest_` user represents anonymous visitors. Pages are
-- viewable by guests through a page_grants row on this user; new pages
-- get one automatically (see api_pages_create / grant_default_guest_view).
-- Its password hash is a placeholder that can never verify, and login
-- additionally rejects the username explicitly.
INSERT OR IGNORE INTO users (username, name, password_hash, is_active, must_change_password, created_at, updated_at)
VALUES ('_guest_', 'Guest', '!guest-no-password', 1, 0, datetime('now'), datetime('now'));

-- Make every existing page viewable by guests by default.
INSERT INTO page_grants (page_id, user_id, granted_by, permission)
SELECT p.id, g.id, NULL, 'view'
  FROM pages p, users g
 WHERE g.username = '_guest_'
ON CONFLICT(page_id, user_id) DO NOTHING;
