-- Optional free-text note attached to a page grant (shown in the
-- access permissions table).
ALTER TABLE page_grants ADD COLUMN note TEXT;
