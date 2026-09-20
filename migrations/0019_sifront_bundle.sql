-- Sifront ZIP bundles: store the unpacked `bundle.js` alongside the
-- existing meta/version so serving never has to open the archive.
-- `content` is kept for legacy HTML sifronts (pre-ZIP).
ALTER TABLE sifronts ADD COLUMN bundle BLOB;
ALTER TABLE sifronts ADD COLUMN bundle_size INTEGER NOT NULL DEFAULT 0;
