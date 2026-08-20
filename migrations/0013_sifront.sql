CREATE TABLE sifronts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO settings (key, value, updated_at) VALUES ('active_sifront_id', '', datetime('now'))
ON CONFLICT(key) DO NOTHING;
