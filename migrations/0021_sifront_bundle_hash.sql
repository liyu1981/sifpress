-- Content hash of the stored bundle, used as a cache key in the served
-- bundle URL so that re-uploading the same version still busts the browser
-- cache (the endpoint is served `immutable`).
ALTER TABLE sifronts ADD COLUMN bundle_hash TEXT NOT NULL DEFAULT '';
