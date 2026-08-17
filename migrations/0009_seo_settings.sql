-- Site-wide SEO settings as a key/value store. Keys are documented in
-- src/seo.php (setting_get()) and editable via settings.update.
CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);