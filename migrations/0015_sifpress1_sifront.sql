-- Seed the `sifpress1` sifront under a fixed, validated id and make it
-- the default active sifront. Content stays empty: dev builds serve the
-- built bundle (dist/sifpress1.sifront) from disk for this id, and any
-- other environment falls back to the construction HTML while empty.
INSERT INTO sifronts (id, name, content, version, meta)
SELECT 1001, 'sifpress1', '', '0.0.1', '{}'
 WHERE NOT EXISTS (SELECT 1 FROM sifronts WHERE id = 1001)
   AND NOT EXISTS (SELECT 1 FROM sifronts WHERE name = 'sifpress1');

-- Become the active sifront by default: claim the slot when it is unset
-- or still points at the old seeded construction page. An explicitly
-- chosen custom sifront is left untouched.
UPDATE settings
   SET value = '1001',
       updated_at = datetime('now')
 WHERE key = 'active_sifront_id'
   AND (value = ''
        OR value = '0'
        OR value IN (
            SELECT CAST(id AS TEXT) FROM sifronts WHERE name = 'Construction Page'
        ));
