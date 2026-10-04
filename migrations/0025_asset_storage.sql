-- Asset bytes move out of the database into an opaque, content-addressed file
-- per object; the row keeps owning identity (name, mime, size, md5) and access
-- control (is_public + asset_grants), so `?p=asset&id=N` URLs and ETags are
-- unchanged by the backend.
--
-- `storage` / `storage_key` / `thumb_key` are NULL for rows that still live in
-- the BLOBs: serving reads either source, so an old artifact and a new one can
-- both run against this schema, and the CLI migration
-- (`php sifpress.php assets migrate-blobs`) can move rows one at a time with a
-- rollback to the previous artifact still possible.
--
-- `data`/`thumb` have to become nullable for new uploads to skip the database,
-- and SQLite cannot relax a NOT NULL constraint in place, so the table is
-- rebuilt. Row ids are copied verbatim.
--
-- DROP TABLE fires the ON DELETE CASCADE of asset_grants, so the grants are
-- copied out first and written back after the rename (defer_foreign_keys only
-- postpones violation checks, it does not stop cascade actions). PRAGMA
-- defer_foreign_keys still guards the rename window, where the parent table is
-- briefly absent.
PRAGMA defer_foreign_keys = ON;

CREATE TEMP TABLE _asset_grants_backup AS SELECT * FROM asset_grants;

CREATE TABLE assets_v2 (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    mime         TEXT    NOT NULL,
    kind         TEXT    NOT NULL CHECK (kind IN ('image', 'video')),
    size_bytes   INTEGER NOT NULL,
    width        INTEGER,
    height       INTEGER,
    duration     REAL,
    md5          TEXT    UNIQUE,
    data         BLOB,
    thumb        BLOB,
    thumb_mime   TEXT,
    uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_public    INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
    -- Storage backend and opaque keys for the original and the thumbnail.
    -- NULL means "still a BLOB row" (legacy, or not yet migrated).
    storage      TEXT,
    storage_key  TEXT,
    thumb_key    TEXT,
    storage_etag TEXT
);

INSERT INTO assets_v2 (
    id, name, mime, kind, size_bytes, width, height, duration, md5,
    data, thumb, thumb_mime, uploaded_by, is_public, created_at,
    storage, storage_key, thumb_key, storage_etag
)
SELECT
    id, name, mime, kind, size_bytes, width, height, duration, md5,
    data, thumb, thumb_mime, uploaded_by, is_public, created_at,
    NULL, NULL, NULL, NULL
  FROM assets;

DROP TABLE assets;

ALTER TABLE assets_v2 RENAME TO assets;

CREATE INDEX idx_assets_kind        ON assets(kind);
CREATE INDEX idx_assets_uploaded_by ON assets(uploaded_by);
CREATE INDEX idx_assets_created     ON assets(created_at DESC);
CREATE INDEX idx_assets_storage_key ON assets(storage_key);

INSERT OR IGNORE INTO asset_grants (asset_id, user_id, granted_by, created_at)
SELECT asset_id, user_id, granted_by, created_at FROM _asset_grants_backup;

DROP TABLE _asset_grants_backup;