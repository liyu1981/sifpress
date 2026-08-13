-- User profile: optional avatar blob (with MIME); display name (users.name)
-- and login-capable email already exist.
ALTER TABLE users ADD COLUMN avatar BLOB;
ALTER TABLE users ADD COLUMN avatar_mime TEXT;
