-- Direct per-user permission grants, layered on top of role permissions so an
-- admin can hand one user an extra capability (e.g. sifronts.manage) without
-- changing their role.

CREATE TABLE user_permissions (
    user_id       INTEGER NOT NULL REFERENCES users(id)       ON DELETE CASCADE,
    permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, permission_id)
);
