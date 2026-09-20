-- The built-in construction sifront is a virtual entry: its page comes from
-- the backend fallback (not from stored content), so it must not be
-- edit/delete-able from the admin UI. Give it an explicit name and mark it.
ALTER TABLE sifronts ADD COLUMN is_virtual INTEGER NOT NULL DEFAULT 0;

UPDATE sifronts
   SET name = 'sifpress_in_construction',
       is_virtual = 1
 WHERE id = 1001;

-- Older installs may still carry the pre-0015 "Construction Page" row.
UPDATE sifronts
   SET is_virtual = 1
 WHERE name = 'Construction Page';
