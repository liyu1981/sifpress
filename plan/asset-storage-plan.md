# asset-storage-plan.md — move asset bytes out of SQLite behind a storage interface

> Status: **phases 1–7 shipped**; phase 8 (object storage) is the only one left.
> Follow-up to `plan/assets_upload.md`, whose decision 1 explicitly reserved this
> escape hatch: *"A later `storage = 'db' | 'file'` column is the escape hatch
> (keep `data` nullable) if the DB ever gets unwieldy."*

Scope: asset bytes stopped living in SQLite `assets.data` / `assets.thumb` BLOBs
and now live in files addressed by an opaque UUID key, behind a storage
interface. Uploads are chunked and resumable, so the per-file ceiling stopped
being a `php.ini` number.

---

## 0. Where this stands

### Shipped

| | What | Where |
|---|---|---|
| Storage seam | `AssetStorage` (`id`/`put`/`open`/`size`/`exists`/`delete`/`localPath`) + `asset_storage()` | `src/storage.php` |
| Filesystem backend | `ab/cd/<uuid4>.<ext>` keys, temp-file + `rename()`, orphan sweep, md5 as etag | `src/storage.php` |
| Schema | `storage` / `storage_key` / `thumb_key` / `storage_etag`; `data`/`thumb` later dropped | `0025`, `0027` |
| Serving | dual-read (storage object *or* BLOB), 256 KiB chunked streaming, Range/206/416/304 | `src/asset.php` |
| Uploads | single-shot *and* chunked/resumable (`assets.upload.*`), bytes stored before the row | `src/api.php`, `0026` |
| Client | `uploadAssetResumable()` — parts in flight, backoff, resume, progress | `ui_sdk/src/upload.ts`, `/assets` |
| Migration | `assets status / migrate-blobs / verify / gc` | `src/cli.php` |
| Housekeeping | `normalize_sifront_copy_kv()` + `drop_legacy_asset_blob_columns()`, idempotent and reportable | `src/db.php`, `db_housekeeping()` |
| Backups | archive holds `sys.db` **and** the asset directory | `src/backup.php` |
| Playback | optional nginx `X-Accel-Redirect` / Apache `X-Sendfile` handoff | `src/asset.php`, `SIFPRESS_ASSET_HANDOFF` |

### What it bought, measured on this dev install

- `sys.db` holds **no asset bytes at all**; the `data`/`thumb` columns are gone
  (`assets status` → `Legacy columns : dropped`), and a VACUUM took the file from
  **9.5 MB → 5.2 MB**.
- **91 MB** of assets on disk, served with 206 ranges — including an **89 MB
  video uploaded through the chunked path on the stock 2M/8M php.ini**, i.e. ~44×
  what a single request could have carried.
- Upload ceiling is now the kind's own cap (200 MB video), not `post_max_size`.
- Playback can leave PHP entirely; per-seek requests no longer pin workers.

### Left

- **Phase 8 — object storage (`S3AssetStorage`).** The seam is deliberately in
  place (`id()` names the backend, `localPath()` returns null so the PHP streamer
  takes over, `put()` is the only method that really changes), so it should be
  additive: a new class, a config block, a multipart `put()`. It is the one
  phase that cannot be tested end to end here without a real bucket.
- **Operator-side config** (not code): an nginx `internal` location or
  `mod_xsendfile` if you want the phase-7 handoff switched on.
- Two open decisions from §9, neither blocking: whether `assets status` should
  also list the largest rows, and whether transcoding is wanted at all.

---

## 1. Why (the original problem)

All four rows are now fixed; kept as the record of what was wrong.

| | Before | Ceiling |
|---|---|---|
| Bytes | `assets.data` BLOB (+ `thumb`) | DB grew by every asset; `VACUUM INTO`, WAL and every `.tgz` backup copied them → **fixed in phases 1–5** |
| Upload | one multipart POST per file | `min(200 MB, 8M − 64 KiB, 1 GiB)` ≈ **1.9 MB** on a default host (`post_max_size` truncates the body before app code runs) → **fixed in phase 6** |
| Worker | one PHP worker per upload, held for the whole transfer | 3 × 200 MB uploads exhausted a 5-worker pool → **fixed in phase 6** (each part is its own small request) |
| Playback | `?p=asset` streams the blob, Range/206 implemented | worked, but every seek and every byte went through PHP → **optional fix in phase 7** |

Verified on this box: `upload_max_filesize=2M post_max_size=8M`.

---

## 2. Decisions

1. **Storage is an interface, not a flag.** `AssetStorage` with a
   filesystem implementation today and an S3 implementation later. The
   artifact gains `?p=asset&id=N` (today) → `?p=asset&id=N` (same URL, new
   backend) with no URL change, because the DB row keeps owning identity,
   MIME, size, ETag and access control. Only *bytes* move behind the seam.
2. **Content-addressed opaque keys, never user filenames.** `assets/ab/cd/<uuid>.<ext>`,
   two hex fan-out levels so no directory ever holds more than ~65k entries.
   `ext` comes from the **sniffed** MIME via a small map (`ASSET_ALLOWED_MIME`),
   never from the client's filename. The original name stays in
   `assets.name` for display and `Content-Disposition`. The content dir lives
   **outside the docroot** (default `<db_dir>/assets`), so the only way to read
   a byte is through `?p=asset`, which already enforces grants + `is_public`.
3. **Dual-read during rollout; `data` is dropped later, not now.** New columns
   are nullable. A row with `storage_key IS NULL` is legacy and still serves
   from its BLOB, so: old artifact ↔ new DB, new artifact ↔ old DB, and a
   rollback mid-migration all keep working. `data` is only cleared in a later
   release (§7), after the migration has been verified.
4. **UUID v4, not v7.** `random_bytes` + manual v4 formatting (no new
   dependency); the fan-out already solves the directory-size problem that v7's
   time ordering would otherwise help with.
5. **The migration is a CLI command on the artifact**, not a repo script:
   `php sifpress.php assets <subcommand>`. A deployment's DB lives on a box
   where the repo is not checked out, so the tool has to ship inside the single
   file. It reuses the artifact's own config/bootstrap/ownership handling
   (`sifpress_cli_adopt_db()`), which a standalone script could not.
6. **Storage dir is a config constant** with the same precedence pattern as
   `SIFPRESS_DB_DIR`: `SIFPRESS_ASSET_DIR` constant → env var →
   `<db_dir>/assets`. Read at runtime, so moving a deployment's assets is a
   config edit, not a rebuild.
7. **Bytes are never buffered in PHP.** `put()` takes a path (already on disk
   from the upload temp file or a staging part), renames/copies into place,
   and `open()` hands back a file handle the existing Range streamer reads with
   `fseek`/`fstream`. No `file_get_contents()` of a 200 MB video, anywhere.
8. **Chunk parts are sized against `post_max_size`, not `upload_max_filesize`.**
   A chunk arrives as a raw request body, so `post_max_size` truncates it the
   same way it truncades the whole file. The server therefore *hands the part
   size to the client* in the create response, derived from the same
   `asset_php_upload_limit()` helper used today. Default 4 MiB, which fits the
   stock 8M `post_max_size` with room for framing.
9. **Backups must cover the asset dir in the same phase that creates it.**
   `backup` currently tars only `sys.db`; leaving it that way produces
   archives that silently lose every asset. Not deferrable.
10. **Thumbnails are unchanged conceptually** — still generated client-side
    (`ui_sdk/src/assets.ts`, canvas → WebP) and uploaded as a second field —
    they just become a second stored object (`thumb_key`) instead of a BLOB.

---

## 3. Storage interface

New fragment `src/storage.php` (added to `build.php` before `asset.php`), or
a `## Storage` section inside `asset.php` — one file either way; prefer the
separate fragment so the S3 backend can grow without touching serving code.

```php
/** Opaque key of one stored object (original or thumbnail). */
final class AssetObject {
    public function __construct(
        public readonly string $key,      // 'ab/cd/<uuid>.<ext>'
        public readonly int $sizeBytes,
        public readonly string $etag,     // md5 hex, as stored on the row
        public readonly string $mime,
    ) {}
}

interface AssetStorage {
    /** Human-readable backend id, persisted on the row. */
    public function id(): string;                      // 'fs' | 's3'

    /** Store $sourcePath under a fresh key. Must not overwrite; must be atomic. */
    public function put(string $sourcePath, string $mime): AssetObject;

    /** Read handle positioned at $offset; false when the key is gone. */
    public function open(string $key, int $offset = 0): mixed;

    public function size(string $key): ?int;
    public function exists(string $key): bool;

    /** Delete original + thumbnail. Missing keys are not an error. */
    public function delete(string $key): void;

    /**
     * Real filesystem path, when the backend has one — the hook for handing
     * playback to the web server (X-Accel-Redirect / X-Sendfile). null for
     * object storage, where the caller streams from open().
     */
    public function localPath(string $key): ?string;
}

/** Config-driven singleton, mirroring db()'s caching pattern. */
function asset_storage(): AssetStorage;
```

`FsAssetStorage` responsibilities:

- `asset_dir()` — resolve + `mkdir -p`, and **refuse** a dir inside
  `DOCUMENT_ROOT` (would expose assets without grants).
- key generation: `bin2hex(random_bytes(16))` → v4 formatting → `ab/cd/…`.
- `put()`: write to `<dir>/.tmp/<uuid>.part`, `fsync`, then `rename()` into
  place (atomic within the same filesystem), `chmod 0644`.
- `localPath()`: validate the key against
  `/^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f-]{36}\.[a-z0-9]{1,8}$/` **before**
  touching the filesystem (traversal defence), then join.
- `open()`: `fopen` + `fseek`; the caller streams in 256 KiB chunks.
- orphan hygiene: `.tmp/` swept opportunistically by `put()` (files > 1 h old).

### 3.1 Schema (migration `0025_asset_storage.sql`)

```sql
-- Bytes move out of the DB; the row keeps owning identity and access control.
ALTER TABLE assets ADD COLUMN storage      TEXT;    -- 'fs' | 's3', NULL = legacy blob row
ALTER TABLE assets ADD COLUMN storage_key  TEXT;    -- opaque key of the original
ALTER TABLE assets ADD COLUMN thumb_key    TEXT;    -- opaque key of the thumbnail
ALTER TABLE assets ADD COLUMN storage_etag TEXT;    -- md5, as returned by put()
CREATE INDEX idx_assets_storage_key ON assets(storage_key);
```

`storage` is filled **per row** (not globally) so a migration can move rows to
a different backend, and so the future S3 backend can coexist with fs rows in
the same table. A table-level default (`'fs'`) is deliberately *not* set: a row
is only `fs` once its bytes are actually on disk.

`data`/`thumb` become nullable in a follow-up (§7), not here.

---

## 4. Serving, unchanged URL, new source

`serve_asset()` keeps its contract exactly (ETag `"asset-<id>"`, 304,
`Accept-Ranges`, 206 + `Content-Range`, 416, `Content-Disposition: inline`,
`nosniff`, grant check → 404). Only the byte source changes:

```
row.storage_key set?
├── yes → asset_storage()->open(key)      → fseek + fread loop, honours $range
│         └── localPath() available && X-Accel-Redirect/Sendfile enabled?
│             └── hand off to the web server (zero PHP for playback)
└── no  → legacy: current SELECT data / SELECT substr(data,?,?) path
```

The legacy branch keeps its current `size_bytes !== length(data)` integrity
check; the storage branch does the same against `stat()` size, so a truncated
or missing file surfaces as a 500 with a clear message instead of a short
read.

The handoff (`asset_handoff_reaches_server()`) is opt-in via
`SIFPRESS_ASSET_HANDOFF` — `x-accel`, `sendfile` or `auto`, default off — and only
fires when `localPath()` resolves to a real file. It runs *after* the grant check
and the 304 short-circuit, and it delegates Range handling to the server; every
other case (mode off, unknown mode, object storage, missing object) falls back to
the PHP streamer, so it is only ever an optimisation.

Server-side configuration the artifact cannot write, so it stays opt-in:

```nginx
location /protected-assets { internal; alias /var/lib/sifpress/assets/; }
```

```apache
a2enmod xsendfile
# vhost: XSendfilePath /var/lib/sifpress/assets
```

`assets status` prints the active mode (`Playback : …`) so an operator can
confirm which path is in use.

---

## 5. Migration tool (the standalone script)

`php sifpress.php assets …` — a CLI subcommand on the artifact rather than a
repo script, because a deployment's DB lives on a box where this repo is not
checked out. It reuses the artifact's own config, bootstrap and ownership
handling.

| Command | Purpose |
|---|---|
| `assets status` | where every asset's bytes live (storage vs BLOB, bytes in DB vs on disk), the playback mode, the legacy-column state, missing objects, orphans |
| `assets migrate-blobs [--dry-run] [--limit=N] [--keep-blobs=0]` | move legacy BLOB rows into storage, one row at a time |
| `assets verify [--sample=N]` | md5 spot-check of stored objects against the rows |
| `assets gc` | delete objects no row points at, sweep expired chunked uploads and stale temp files |

`migrate-blobs` refuses to start without the free disk the pending set needs,
verifies size *and* md5 per row before touching the row, and stops cleanly on
interrupt — each row is independent, so a re-run resumes. `--keep-blobs` defaults
**on** so a rollback to the previous artifact still serves the bytes; a later run
with `--keep-blobs=0` clears them (this is what shrinks `sys.db`, and only after
a VACUUM).

## 6. Chunked resumable upload (phase 6, built on the same seam)

| Action | Body | Returns |
|---|---|---|
| `assets.upload.create` | JSON `{name, size_bytes, mime?, width?, height?, duration?, upload_id?}` | `{upload_id, part_size, parts_total, parts, expires_at}` |
| `assets.upload.part` | raw `application/octet-stream`, `?upload_id=&part=` | `{received, part, bytes}` |
| `assets.upload.complete` | **multipart** (`md5?`, `thumb?`) — the client-generated thumbnail rides along | `asset_payload` |
| `assets.upload.cancel` | `?upload_id=` | `{ok}` |

**Why the server hands out the part size.** A chunk is a raw request body, so
`post_max_size` truncates it exactly like a whole file would; `asset_upload_part_size()`
derives a size from `asset_php_upload_limit()` (≈1 MB on a stock 8M/2M host) and
the client never has to guess.

**Why this lifts the file ceiling.** `asset_effective_cap($kind, $chunked)` skips
the php.ini limit on the chunked path, because no single request carries more
than one part. A single-shot `assets.create` is still bounded by `post_max_size`.

`complete` re-runs the single-shot validation on the assembled file — magic-byte
MIME sniffing, the cap for the detected kind, optional client md5 — then stores
the object and inserts the row. Duplicates short-circuit to the existing row
(`md5` is UNIQUE) and the staging file is dropped, so no orphan is left.

Staging lives on disk at `<asset_dir>/staging/<token>.part`, written with
`flock(LOCK_EX)` at an offset derived from the part index rather than trusted
from the client. Rows expire after 24 h and are swept on `create` and by
`assets gc`.

Resume: the client keeps `{upload_id, parts}` in `localStorage` keyed by
`name:size:lastModified`, and `create` reattaches to a matching, unexpired
reservation owned by the same user, so a retry sends only what is missing.

## 7. Sequence (each step is independently shippable)

**Progress**

| # | Step | State |
|---|---|---|
| 1 | `0025` schema + `AssetStorage`/`FsAssetStorage` + `asset_dir()`/`SIFPRESS_ASSET_DIR` | **done** (`migrations/0025_asset_storage.sql`, `src/storage.php`) |
| 2 | Dual-read serving (`storage_key` → file, else BLOB) + `assets` CLI | **done** (`serve_asset()`, `sifpress_cli_assets()`) |
| 3 | `assets.create` writes bytes through storage for **new** uploads | **done** |
| 4 | `backup` archives `sys.db` **and** the asset dir | **done** (`backup_tar_sources()`) |
| 5 | Second pass: clear `data`/`thumb`, then drop the columns | **done** (`0027` + `drop_legacy_asset_blob_columns()`; the drop is refused while any row is unmigrated, and SQLite < 3.35 keeps the empty columns) |
| 6 | Chunked upload API + client + progress UI | **done** (`0026`, `assets.upload.*`, `ui_sdk/src/upload.ts`, progress bar on `/assets`) |
| 7 | `X-Accel-Redirect` / `X-Sendfile` handoff for playback | **done** (`SIFPRESS_ASSET_HANDOFF`, `asset_handoff_reaches_server()`); off by default, since the server half is operator configuration |
| 8 | `S3AssetStorage` — `put()` becomes a multipart upload, `localPath()` returns null so PHP streams instead | **not started** — the only phase left; needs a real bucket to verify |

Two things the plan did not predict:

- **`asset_effective_cap()` folded the php.ini limit into the per-file cap**, so
  chunking inherited a 2 MB ceiling it exists to remove. The signature now takes
  `$chunked`, and the chunked path checks only the kind's own cap (and not
  `SQLITE_MAX_LENGTH`, because those bytes never become a BLOB).
- **The seeded favicon was a BLOB row**, which counted as unmigrated and would
  have kept the columns alive on every fresh install forever. `seed_favicon()`
  now stores the SVG through the backend like every other asset.

Phase 5 also made the queries shape-aware: `asset_columns()` (cached
`PRAGMA table_info`), `asset_blob_columns()` and `asset_insert_sql()` build the
serving SELECT, the two upload INSERTs and the CLI totals around whatever the
database still has, so the app runs identically before and after the drop.

Two deviations from the original text, both forced by reality:

- **`data`/`thumb` became nullable in `0025`, not in step 5.** Step 3 (new
  uploads skipping the DB) cannot work while `data` is `NOT NULL`, and SQLite
  cannot relax that in place, so `0025` rebuilds the table. `DROP TABLE` fires
  `asset_grants`' `ON DELETE CASCADE`, so the migration copies the grants out to
  a temp table and writes them back (`defer_foreign_keys` postpones violation
  checks but does not stop cascade actions — found the hard way).
- **The archive stores the asset directory under its own name**
  (`tar -C <parent> <basename>`), not under a hardcoded `assets/`, because
  `SIFPRESS_ASSET_DIR` can be any path. Restoring is then a straight copy back
  into the configured directory.

Deployment order mattered and shipped in this order: **1 → 2 → 3 → 4 → 5 → 6 →
7**, because a database with dropped `data` columns is unreadable by an older
artifact while a new artifact reading old rows is not. Phase 7 has no ordering
constraint (it only reads `storage_key`).

---

## 8. Testing (no browser in this environment — by construction)

Per the repo's no-browser rule, verification is `php -l`, `pnpm run typecheck`,
`curl` and CLI. Five harnesses live outside the repo and are run against throwaway
installs (plus the dev server for the live checks):

| Harness | Covers |
|---|---|
| storage suite (50 assertions) | migration (dry-run writes nothing, per-row md5/size, blobs kept for rollback), serving parity between a migrated row and a deliberate legacy control row (identical bodies, same ETag, open-ended/suffix/mid ranges, 416, 304, thumb, private → 404), upload through the API (row → `fs`, `data` length 0, dedupe, delete removes both objects), `gc`, backup → extract → byte-identical object |
| chunked suite (44) | part splitting, incomplete → 409, wrong part length → 422 with the staging file untouched, out-of-range/negative parts → 422, completion storing a byte-identical object, dedupe without an orphan, another user → 403, anonymous → 401, expiry sweep, and the single-shot path still 413-ing where chunking succeeds |
| phase-5 suite (32) | fresh install drops the columns; an unmigrated install keeps them, serves its BLOB row and reports what to run; after `migrate-blobs` the next `migrate` drops them and every asset still serves with ranges |
| phase-7 suite (28) | default PHP streaming, `x-accel` header with no body and no `Content-Range`, thumbnails handed off, 304 short-circuited in PHP, private asset refused *before* any handoff, missing object → clean 500, custom path, `sendfile`, `auto`, nonsense mode falls back, env var |
| uploader harness (20, Node) | part ordering, monotonic progress, transient retry, 4xx final, reattach sending only the missing part, mid-flight abort leaving a resumable record — driven against a stubbed API with the real `upload.ts` |

Live checks on this dev install: the 89 MB video serves 200 full and 206 with
correct `Content-Range` (leading and suffix ranges), its file md5 equals the row's,
and both artifacts lint clean.

## 9. Risks / open questions

**Settled during the work**

- *Backup compatibility* — decided: one archive containing `sys.db` plus the asset
  directory under its own name, so a restore is a straight copy back into
  `SIFPRESS_ASSET_DIR`. Old DB-only archives still restore; they just have no
  assets, which `--dry-run` and the `Included:` line now make explicit.
- *Disk vs DB growth* — the columns are dropped and a VACUUM reclaims the pages
  (9.5 MB → 5.2 MB here). Until an operator runs it, the file stays large;
  `assets status` says so.
- *Two copies at peak* — the free-space guard refuses to start a migration that
  cannot fit.
- *`users.avatar`* — still a BLOB, deliberately: ≤1 MB, inlined in every payload,
  no size problem. Revisit only if the avatars ever need the storage backend.

**Still open**

- **Phase 8 needs a real bucket.** `S3AssetStorage` cannot be verified end to end
  in this environment; it would ship with unit coverage of the key/etag plumbing
  and manual verification against a throwaway bucket.
- **No transcoding.** The bytes you upload are the bytes served, so a 4K HEVC
  phone clip still will not play in Safari. A managed stream (Cloudflare Stream /
  Mux) is far less work than building that here — worth deciding before phase 8,
  since both answer "where do the heavy videos live".
- **`assets status` could list the largest rows** to show what is actually
  driving disk usage. Trivial; not done.
- **Mixed-backend installs**: `storage` is per row, so migrating some rows to
  S3 and leaving the rest on disk is representable but untested.

**Operational notes worth keeping**

- Phase 5 is a **one-way door**: an artifact older than `0027` cannot read a
  database without those columns. Migrate the bytes first, then roll forward, and
  keep a backup.
- `assets migrate-blobs --keep-blobs` (the default) is the rollback path; take a
  backup anyway before running the cleanup.
