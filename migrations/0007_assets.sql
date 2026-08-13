-- Asset uploads: images and short videos stored as blobs with metadata.
CREATE TABLE assets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    mime        TEXT    NOT NULL,
    kind        TEXT    NOT NULL CHECK (kind IN ('image', 'video')),
    size_bytes  INTEGER NOT NULL,
    width       INTEGER,
    height      INTEGER,
    duration    REAL,
    md5         TEXT    UNIQUE,
    data        BLOB    NOT NULL,
    thumb       BLOB,
    thumb_mime  TEXT,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_public   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assets_kind        ON assets(kind);
CREATE INDEX idx_assets_uploaded_by ON assets(uploaded_by);
CREATE INDEX idx_assets_created     ON assets(created_at DESC);
