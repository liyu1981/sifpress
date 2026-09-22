-- Published state and "hide from article search" are page-level flags.
-- Revisions snapshot content only, so publish state must not live on
-- page_revisions. pages.status already holds the authoritative current
-- value for every existing row, so nothing needs to be copied over.

-- New page flag: default off, i.e. existing articles stay searchable.
ALTER TABLE pages ADD COLUMN hide_from_search INTEGER NOT NULL DEFAULT 0;

-- Discard per-revision publish state (current state already lives on pages).
ALTER TABLE page_revisions DROP COLUMN status;
