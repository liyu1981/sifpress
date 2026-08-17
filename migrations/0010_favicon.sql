-- Favicon and Apple Touch Icon settings.
-- The actual default favicon asset is seeded in db.php (binary blob).
INSERT INTO settings (key, value, updated_at)
VALUES
    ('favicon_asset_id', '', datetime('now')),
    ('apple_touch_icon_asset_id', '', datetime('now')),
    ('favicon_version', '0', datetime('now')),
    ('favicon_mime', 'image/svg+xml', datetime('now'));
