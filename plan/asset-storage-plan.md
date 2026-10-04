# asset-storage-plan.md — move asset bytes out of SQLite behind a storage interface

> Status: **phases 1–6 implemented** (`0025`–`0027`, `AssetStorage` + filesystem
> backend, dual-read serving, storage-backed uploads, asset-aware backups, the
> `assets` CLI, chunked resumable upload, and the phase-5 column cleanup).
> Phases 7 (`X-Accel-Redirect`) and 8 (S3) remain.
> Follow-up to `plan/assets_upload.md`, whose decision 1 explicitly reserved
> this escape hatch: *"A later `storage = 'db' | 'file'` column is the escape
> hatch (keep `data` nullable) if the DB ever gets unwieldy."* This is that
> escape hatch, plus chunked resumable upload on top of it.

Scope: asset bytes stop living in SQLite `assets.data` / `assets.thumb` BLOBs
and move to a content directory addressed by an opaque UUID key, behind a
storage interface with a filesystem implementation and room for a future
object-storage backend. Then uploads become chunked and resumable, so the
per-file ceiling stops being a `php.ini` number.

---

## 1. Why now

| | Today | Ceiling |
|---|---|---|
| Bytes | `assets.data` BLOB (+ `thumb`) | DB grows by every asset; `VACUUM INTO`, WAL and every `.tgz` backup copy them |
| Upload | one multipart POST per file | `min(200 MB, 8M − 64 KiB, 1 GiB)` ≈ **1.9 MB** on a default host (`post_max_size` truncates the body before app code runs) |
| Worker | one PHP worker per upload, held for the whole transfer | 3 × 200 MB uploads exhaust a 5-worker pool |
| Playback | `?p=asset` streams the blob, Range/206 implemented | works, but every seek and every byte goes through PHP |

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

`X-Accel-Redirect` is opt-in via config (`SIFPRESS_ASSET_ACCEL = 1`) and only
when `localPath()` is non-null, because it requires an nginx `internal`
location that this artifact cannot configure for the operator. Behind Apache,
`X-Sendfile` needs `mod_xsendfile`. Both are a phase-3 nicety; the PHP streamer
must be correct first.

---

## 5. Migration tool (the standalone script)

`php sifpress.php assets …`, in `src/cli.php` next to `sessions`/`backup`:

| Command | Purpose |
|---|---|
| `assets status` | rows total / legacy / migrated, bytes on disk vs in DB, orphan files, missing files, free disk |
| `assets migrate-blobs [--dry-run] [--limit=N] [--keep-blobs]` | the migration |
| `assets verify [--sample=N]` | md5 spot-check of migrated rows against the files |
| `assets gc` | delete orphan files and expired staging uploads |

`migrate-blobs` algorithm, per row (`WHERE storage_key IS NULL AND data IS NOT NULL`):

1. `SELECT … FROM assets WHERE id = ?` in a loop (`LIMIT/OFFSET` by id, not
   offset — concurrent edits shift offsets); `BEGIN IMMEDIATE` around each row
   so a request-time upload cannot interleave.
2. `asset_storage()->put()` needs a *path*, so write the blob to
   `<asset_dir>/.tmp/<uuid>.incoming` with `fopen`/`fwrite` in 1 MiB chunks
   (never `file_get_contents` on a 200 MB blob), then `put()` that file.
3. Verify `filesize == size_bytes` and (cheap, streamed) md5 matches `md5`.
   Mismatch → delete the file, leave the row legacy, report it.
4. `UPDATE assets SET storage, storage_key, thumb_key, storage_etag` — and, for
   the thumbnail, the same treatment for `thumb`/`thumb_mime`.
5. Count bytes freed vs written; stop cleanly on `Ctrl-C` (each row is
   independent, so a re-run resumes).

Guards, all of which the tool checks *before* touching anything:

- **free disk ≥ Σ(`size_bytes` + `length(thumb)`) of the pending set**;
  abort with the numbers rather than half-filling the disk.
- `--dry-run` prints the exact plan (row ids, keys that *would* be created,
  byte totals) and changes nothing.
- `--keep-blobs` (default **on** for the first release) leaves `data` in place
  so a rollback to the previous artifact still serves the bytes; a second run
  with `--keep-blobs=0` clears them (this is what actually shrinks the DB,
  since SQLite only returns freed pages to the OS on VACUUM — the tool runs
  `PRAGMA incremental_vacuum` / suggests a plain `VACUUM`).
- `sifpress_cli_adopt_db()`/`sifpress_cli_adopt_owner()` after every write, so
  files land owned by the web user even when the CLI runs as root.
- `assets status` afterwards must report `legacy: 0, missing: 0`.

Rollback: an artifact from before this change ignores the new columns and
still serves BLOBs, which is exactly why `--keep-blobs` defaults on.

---

## 6. Chunked resumable upload (phase 2, built on the same seam)

Three new actions next to the existing `assets.create` (which stays for small
files and for the API's backwards compatibility):

| Action | Body | Returns |
|---|---|---|
| `assets.upload.create` | JSON `{name, size_bytes, mime?}` | `{upload_id, part_size, parts}` — `part_size` from `asset_php_upload_limit()`, `parts` = already-received part numbers (resume) |
| `assets.upload.part` | raw `application/octet-stream`, `?upload_id=&part=` | `{received, bytes}` |
| `assets.upload.complete` | JSON `{md5?}` | the usual `asset_payload` |
| `assets.upload.cancel` | — | `{ok}` |

New table (`0026_asset_uploads.sql`):

```sql
CREATE TABLE asset_uploads (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    token       TEXT    NOT NULL UNIQUE,   -- uuid, the only thing the client holds
    name        TEXT    NOT NULL,
    mime        TEXT,                      -- provisional; sniffed at complete
    size_bytes  INTEGER NOT NULL,
    part_size   INTEGER NOT NULL,
    parts_json  TEXT    NOT NULL DEFAULT '[]',  -- received part numbers
    bytes       INTEGER NOT NULL DEFAULT 0,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at  TEXT    NOT NULL
);
CREATE INDEX idx_asset_uploads_expiry ON asset_uploads(expires_at);
```

Rules that make this safe:

- **Staging is on disk**, at `<asset_dir>/staging/<token>` — never in SQLite,
  which is the whole point of phase 1. Parts are written with
  `fopen('c+b')` + `fseek(offset)` + `fwrite`, under `flock(LOCK_EX)`.
- **Part identity is `part = floor(offset / part_size)`** and the server
  validates `offset === part * part_size` and
  `offset + len <= size_bytes`, so a client cannot write outside its file.
- **`complete`** re-runs the *same* validation the single-shot path does:
  MIME sniffed from magic bytes on the assembled file (never trusted from the
  client), size cap, allowed-MIME whitelist. Only then does it `put()` the file
  under its final UUID key, insert the `assets` row, and delete staging.
- **Ownership**: `part`/`complete`/`cancel` require `assets.upload` *and*
  `user_id === current_user` (admins may steal). A random uuid in the URL is
  not authorization.
- **TTL sweep**: `expires_at` = now + 24 h; rows + staging files purged
  opportunistically on every `create` (bounded sweep, e.g. 20 rows) and by
  `assets gc` / the existing `cron` command.
- **Idempotence**: re-PUTting a part is allowed and overwrites (retry-safe);
  `complete` on an already-completed upload returns the existing payload rather
  than creating a duplicate (guarded by the `md5 UNIQUE` index).

Client side (`ui_sdk/src/upload.ts`, new; `assets.ts` keeps thumbnail logic):

- slice the `File` into `part_size` chunks, 3 in flight;
- per-part retry with exponential backoff + jitter (network 5xx and `413`
  re-derive the part size from the error and continue);
- `AbortSignal` wired to the existing cancel affordance on the assets page;
- **resume across reloads**: fingerprint = `name + size + lastModified`, and
  the `upload_id` + received parts in `localStorage`; on return, `create`
  hands back the missing parts, so only the remaining bytes are sent;
- `onProgress({sent, total, part})` drives the existing progress bar, which
  today has no progress at all because `fetch` cannot report upload progress —
  chunk boundaries fix that too, since progress is computed client-side.

---

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
| 7 | `X-Accel-Redirect` / `X-Sendfile` handoff for playback | pending — `localPath()` returns the path it needs |
| 8 | (future) `S3AssetStorage` | not started |

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

Deployment order still matters: **1 → 2 → 3 → 4 → (5) → 6**, because a DB with
dropped `data` columns is unreadable by an older artifact while a new artifact
reading old rows is not.

---

## 8. Testing (no browser in this environment — by construction)

Per the repo's no-browser rule, verification is `php -l`, `typecheck`, `curl`
and CLI:

- `migrate-blobs` on a copy of the dev DB: `--dry-run` output; real run; then
  `status` = `legacy: 0, missing: 0, orphans: 0`, `pragma integrity_check` ok,
  and every migrated file's md5 == the row's `md5` (`assets verify --sample`).
- Rollback rehearsal: with `--keep-blobs`, drop the new artifact back in and
  confirm a legacy row still serves from its BLOB.
- Serving parity, via `curl` on the dev server for an image *and* a video:
  `200` full length, `206` for `bytes=0-1023` with the right `Content-Range`,
  `416` for a bad range, `304` on `If-None-Match`, identical `ETag` before and
  after the migration.
- Chunked upload, via `curl`: `create` → PUT parts → `complete` → assert the
  row + file; re-PUT one part (idempotent); `complete` twice (no duplicate);
  a part with a wrong `offset` (400); another user's `upload_id` (403); an
  oversized total (413); resume: `create` again returns `parts` with the gap.
- `assets gc`: seeded orphan file + expired upload row both disappear.
- `backup` + restore into a scratch dir, then serve an asset from the restored
  copy.
- `pnpm run typecheck` + `format` in `ui_sdk` and `admin_ui`.

---

## 9. Risks / open questions

- **`backup` compatibility.** Step 4 changes archive contents. Old archives
  (DB-only) still restore, they just have no assets; a restore script must be
  told which kind it is. Decide: keep one archive (simplest) or add a separate
  `assets-<stamp>.tar.gz`?
- **Disk vs DB growth.** Moving bytes out shrinks `sys.db` only after `VACUUM`
  (§7 step 5); until then the file stays large. Plan the maintenance window.
- **Two copies at peak.** During migration the DB *and* the asset dir hold the
  bytes, so peak disk ≈ DB size + total assets. The free-space guard covers it.
- **Range on a moved file**: unchanged, but `Content-Length` now comes from
  `stat()`; a file truncated by a failed disk write must 500 rather than serve
  a short body (covered in §4).
- **`users.avatar`** is still a BLOB (`serve_user_avatar` reads it inline).
  Deliberately left alone: avatars are ≤ 1 MB and inline in every payload; moving
  them means a second storage path for a case with no size problem. Revisit if
  the schema cleanup in step 5 wants a uniform table.
- **Transcoding** stays out of scope: this stores the bytes you upload, so a
  4K HEVC phone clip still won't play in Safari. If that matters, a managed
  stream (Cloudflare Stream / Mux) is far less work than building it here.
- Open: should `assets.status` also report the largest rows, to find what is
  actually driving DB size? (Probably yes; trivial.)