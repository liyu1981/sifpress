-- Article revisions: git-style versioning with SHA1 hashes.

CREATE TABLE page_revisions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id       INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    revision_id   TEXT    NOT NULL UNIQUE,
    parent_ids    TEXT    NOT NULL DEFAULT '[]',
    slug          TEXT    NOT NULL,
    title         TEXT    NOT NULL,
    content_md    TEXT    NOT NULL,
    status        TEXT    NOT NULL,
    created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at    TEXT    NOT NULL,
    committed_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    commit_message TEXT   NOT NULL
);

CREATE INDEX idx_revisions_page ON page_revisions(page_id, committed_at DESC);

ALTER TABLE pages ADD COLUMN current_revision_id TEXT;
