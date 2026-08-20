-- Key-value store with per-entry RBAC grants.
--
-- kv_pairs holds the key (any string, unique) and a JSON-encoded value.
-- kv_grants controls who may view/edit each pair; the _guest_ user holding
-- a grant makes a pair readable by anonymous visitors (the default, so new
-- pairs are public). The creator is the implicit "owner"; admins can read
-- and edit everything by policy.
CREATE TABLE kv_pairs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    key        TEXT    NOT NULL UNIQUE,
    value_json TEXT    NOT NULL,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    updated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_kv_pairs_updated ON kv_pairs(updated_at DESC);

CREATE TABLE kv_grants (
    kv_id      INTEGER NOT NULL REFERENCES kv_pairs(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now')),
    permission TEXT    NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
    note       TEXT,
    PRIMARY KEY (kv_id, user_id)
);