-- Per-asset edit grants. The uploader owns the asset and admins can always
-- edit; these rows let the owner/admin grant other users edit access. Viewing
-- stays governed by assets.is_public.

CREATE TABLE asset_grants (
    asset_id   INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (asset_id, user_id)
);
