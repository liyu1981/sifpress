-- Chunked, resumable uploads.
--
-- A large asset is sent as several small parts (each one an ordinary request
-- that fits inside `post_max_size`) into a staging file on disk; `complete`
-- re-runs the same validation the single-shot path does — magic-byte MIME
-- sniffing, size caps, the allowed-MIME whitelist — and only then moves the
-- bytes into storage under their final uuid key and inserts the `assets` row.
--
-- The row tracks which parts have landed, so an interrupted upload resumes by
-- asking the server what is still missing (`parts`) instead of starting over.
-- `token` is a uuid and is the only handle the client holds; ownership is
-- enforced by `user_id`, never by possession of the token.
--
-- Staged bytes live under <asset_dir>/staging, never in SQLite, and every row
-- expires: `assets.gc` (and an opportunistic sweep on create) removes both the
-- row and its staging file.
CREATE TABLE asset_uploads (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    token      TEXT    NOT NULL UNIQUE,
    name       TEXT    NOT NULL,
    mime       TEXT,
    size_bytes INTEGER NOT NULL,
    part_size  INTEGER NOT NULL,
    -- JSON array of received part numbers (0-based).
    parts_json TEXT    NOT NULL DEFAULT '[]',
    -- Client-reported dimensions, carried over to the assets row on complete.
    width      INTEGER,
    height     INTEGER,
    duration   REAL,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT    NOT NULL
);
CREATE INDEX idx_asset_uploads_expiry ON asset_uploads(expires_at);
CREATE INDEX idx_asset_uploads_user   ON asset_uploads(user_id);