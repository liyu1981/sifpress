# assets_upload.md — Assets Upload & Management Plan

Scope: authenticated users upload **images and short videos**, stored as
**BLOBs in SQLite** with metadata, listed/managed on a new `/assets` page.
Image/video thumbnails are generated **client-side** (zero PHP footprint —
GD and Imagick are not available in this environment and must not be assumed).

## Key decisions

1. **Blobs live in SQLite.** A new `assets` table stores the original bytes
   (`data` BLOB) plus an optional generated thumbnail (`thumb` BLOB). This
   matches the project's "single file, copy-anywhere" ethos — no filesystem
   uploads dir, no artifact-dir dependency. Trade-off: the DB file grows by
   the sum of assets and WAL churn increases. Acceptable for a personal /
   small-team app. A later `storage = 'db' | 'file'` column is the escape
   hatch (keep `data` nullable) if the DB ever gets unwieldy.
2. **Thumbnails are generated in the browser before upload** (canvas →
   `toBlob('image/webp')`). This is the researched answer to "without or
   with minimal PHP footprint": there is **no GD, no Imagick** here, and
   embedding a pure-PHP image decoder to do it server-side is slow, heavy,
   and shaky for WebP/AVIF. Client-side generation is free, dependency-free,
   and also yields video poster frames. The tiny thumb (≈5–30 KB) rides in
   the same multipart request as the original.
3. **MIME is never trusted from the client.** The `fileinfo` extension
   (already available) sniffs magic bytes server-side; the extension and the
   `mime` are cross-checked against a whitelist. **SVG is rejected** for
   stored assets: served inline on the same origin it is an XSS vector.
4. **Size caps are computed at runtime as `min(desired cap, PHP limit,
   SQLite limit)`.** PHP's `upload_max_filesize`/`post_max_size` are read via
   `ini_get()` (defaults 2M/8M) and SQLite's ceiling is the compiled-in
   `SQLITE_MAX_LENGTH` (default 1 GiB; not queryable through PDO — treated as
   a documented constant). dev.sh and deployment docs still raise the PHP
   side (`-d upload_max_filesize=256M -d post_max_size=256M`) so real files
   aren't capped at 2M/8M; the runtime detection keeps the app safe wherever
   it is deployed. Oversized requests are additionally rejected from the
   `Content-Length` header before the body is read (413).
5. **A new `module=asset` router branch streams binary blobs.** The existing
   `module=api` always emits JSON; binary serving gets its own fragment
   (`src/asset.php`) with correct `Content-Type`, `Cache-Control`, `ETag`,
   and `nosniff`. Access: public by default (`is_public=1`); assets marked
   `is_public=0` require any authenticated user.
6. **RBAC via a new permission `assets.upload`**, seeded to `admin` +
   `editor` in `seed_rbac()` (admin already receives every permission).
   Delete is ownership-aware: your own uploads, or any upload if you have
   the permission/admin. The `/assets` page itself is auth-gated (any logged-
   in user can view; upload needs the permission).
7. **Uploads are multipart, an exception to the JSON API.** `module=api&action=assets.create` accepts `multipart/form-data` (`$_FILES['file']` + `$_FILES['thumb']`), so big binaries stream through PHP's temp-file machinery instead of `read_json_body()`.

## Constraints discovered (verified in this environment)

- PHP modules: **no gd, no imagick** (only `fileinfo`, `sqlite3`, PDO).
- Default `php.ini`: `upload_max_filesize = 2M`, `post_max_size = 8M`,
  `max_file_uploads = 20`. `post_max_size` truncates the body *before* any
  app code runs, so it must be raised at the server level — `ini_set()` is
  too late.
- SQLite 3.45.1, WAL mode, `busy_timeout`/`foreign_keys` already set by
  `db()`.

## Repository layout changes

```
migrations/
  0007_assets.sql          NEW: assets table
src/
  api.php                  + assets.list/get/update/delete actions (JSON)
                           + assets.create (multipart)
  asset.php                NEW: ?module=asset binary serving fragment
  router.php               + module=asset dispatch branch
  db.php                   + 'assets.upload' in seed_rbac() permission lists
build.php                  + 'asset.php' to $parts (after api.php)
dev.sh                     + -d upload_max_filesize/post_max_size/max_file_uploads
frontend/src/
  lib/api.ts               + uploadRequest() (FormData, no JSON header)
                           + assetUrl(id, thumb?)
  lib/pages.ts             + Asset type + assetsApi
  lib/assets.ts            NEW: makeImageThumb / makeVideoThumb (canvas)
  pages/assets.tsx         NEW: assets management page
  router.tsx               + /assets route; nav link; needsAuth update
  lib/i18n.ts              + assets.* keys (en/zh)
plan/
  assets_upload.md         this plan
```

## Schema — migrations/0007_assets.sql

```sql
CREATE TABLE assets (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    mime        TEXT    NOT NULL,
    kind        TEXT    NOT NULL CHECK (kind IN ('image', 'video')),
    size_bytes  INTEGER NOT NULL,
    width       INTEGER,
    height      INTEGER,
    duration    REAL,
    md5         TEXT    UNIQUE,
    data        BLOB    NOT NULL,
    thumb       BLOB,
    thumb_mime  TEXT,
    uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_public   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_assets_kind        ON assets(kind);
CREATE INDEX idx_assets_uploaded_by ON assets(uploaded_by);
CREATE INDEX idx_assets_created     ON assets(created_at DESC);
```

`name` = sanitized original filename (`sunset.webp`); `md5` = content hash,
UNIQUE so a duplicate upload race is impossible (NULL md5 values are distinct
in SQLite, so only real matches collide). `width`/`height`/`duration` are
**client-reported** (zero PHP image parsing); a server-side magic-byte
dimension parser for JPEG/PNG/GIF/WebP is a later hardening option, not v1.

## Limits (point 3)

Effective per-kind caps are computed at runtime:

```
effective_kind_cap = min(desired_kind_cap, php_upload_limit, sqlite_max_length)
php_upload_limit   = min(parse_bytes(ini_get('upload_max_filesize')),
                         parse_bytes(ini_get('post_max_size')))
sqlite_max_length  = 1 GiB   // SQLITE_MAX_LENGTH compile default (not
                             // queryable via PDO; documented constant)
```

| Desired cap (constants) | Value   | Notes |
|---|---|---|
| `ASSET_MAX_IMAGE_BYTES` | 15 MiB | jpeg/png/gif/webp/avif |
| `ASSET_MAX_VIDEO_BYTES` | 200 MiB | mp4/webm/ogg short clips |
| `ASSET_THUMB_MAX_BYTES` | 512 KiB | client-generated thumb |
| `ASSET_MAX_NAME_BYTES`  | 255      | filename length |

Helpers: `parse_ini_bytes()` parses `2M` / `256M` / `-1` ini values (`-1` =
unlimited → ignore that term). The reported limit and the `413` threshold is
`min(desired, php_upload_limit, sqlite_max_length)`; a small overhead
allowance is subtracted from `post_max_size` for multipart framing bytes.

Why detect at runtime: `upload_max_filesize`/`post_max_size` are consumed by
PHP before any app code runs, and dev vs. prod php.ini differ. Detection
keeps the app safe anywhere; dev.sh and AGENTS.md still raise the dev PHP
values (`-d upload_max_filesize=256M -d post_max_size=256M`) so dev is not
pinned at 2M/8M.

Enforcement order on `assets.create`:
1. `Content-Length` header > effective cap → `413` immediately, before
   reading the body.
2. `$_FILES['file']['error']` — `UPLOAD_ERR_INI_SIZE` → `413` with a message
   naming the detected php.ini limit (the dev.sh `-d` flags raise it).
3. After reading: `filesize(tmp_name)` > effective cap → `413`.
4. Per-row `size_bytes` recorded.

Memory: bind `data`/`thumb` via a **stream** (`PDO::PARAM_LOB` +
`fopen($_FILES[...]['tmp_name'])`) instead of `file_get_contents()`, so a
large video never sits in PHP memory. (pdo_sqlite writes via SQLite overflow
pages, not the PHP heap.)

## Upload flow

```
<input type=file multiple accept="image/jpeg,image/png,image/gif,image/webp,
                                  image/avif,video/mp4,video/webm,video/ogg">
        │  per file
        ▼
lib/assets.ts: read as blob → if image: <img>/createImageBitmap →
              canvas scale to max 400px → toBlob('image/webp') = thumb
              if video: <video> + URL.createObjectURL → seek to
              min(0.5s, dur*0.1) → draw to canvas → toBlob = poster
        │  collect {width, height, duration} (ImageBitmap / video metadata)
        ▼
FormData { file: File, thumb?: Blob, name, kind, width, height, duration }
        │  uploadRequest('api', 'assets.create', formData)   ← new helper
        ▼
api.php assets.create: require_permission('assets.upload')
        → magic-byte MIME sniff (finfo) ∩ whitelist
        → size checks (above) → md5 = hash_file('md5', tmp)
        → existing md5? → 200 {asset: existing, duplicate: true} (no insert)
        → else INSERT row (streams) → 201 {asset: meta}
```

Thumbnail fallbacks: canvas `toBlob('image/webp')` silently degrades to
PNG/JPEG where WebP encoding is unsupported; if frame capture fails for a
video (unsupported codec) `thumb` is omitted and the grid shows a video-
glyph tile (`<video>` preview on click). Server never fabricates a thumb.

## Whitelist (point 1)

- **Images**: `image/jpeg`, `image/png`, `image/gif`, `image/webp`,
  `image/avif`. (`image/svg+xml` rejected — same-origin XSS vector; BMP/TIFF
  are not "popular web" formats and are rejected too.)
- **Videos**: `video/mp4` (H.264/AAC — Safari/Chromium), `video/webm`
  (VP8/VP9), `video/ogg` (Theora).
- Detection: `finfo_file($tmp)` magic bytes; stored `mime` = detected MIME
  (client-declared value used only as a tie-breaker). Extension must match
  the detected MIME.

## API surface

All under `module=api`, auth-gated by the existing `handle_api()` guard
(which also enforces `must_change_password`). New actions:
`assets.list`, `assets.get`, `assets.create` (multipart), `assets.update`,
`assets.delete`. Add them to the index `actions` list.

- `GET  assets.list`   `kind` | `page` | `per_page` | `q` (name LIKE) →
  `{items: AssetMeta[], total, page, per_page}`. **Meta only, no blobs.**
- `GET  assets.get`    `id` → `{asset: AssetMeta}` (meta only).
- `POST assets.create` multipart (above) → `201 {asset}` (new) or
  `200 {asset, duplicate: true}` (md5 match, existing row returned) |
  `413` (oversize) | `415` (unsupported type) | `422` (validation).
- `PATCH assets.update` `id`, `{name?, is_public?}` — owner or admin.
- `DELETE assets.delete` `id` — owner or admin.

`AssetMeta`: `{id, name, mime, kind, size_bytes, width, height, duration,
md5, is_public, uploaded_by, uploaded_by_name, created_at, url, thumb_url}`.
`url`/`thumb_url` are precomputed as `?module=asset&id=N[&thumb=1]`.

## Binary serving — src/asset.php (new fragment)

```
GET ?module=asset&id=N            → original blob
GET ?module=asset&id=N&thumb=1    → thumbnail blob (404 if none)
```

- Guard `db_needs_migration()` → 503 (columns don't exist yet).
- Access: `is_public=1` (the default) → public; `is_public=0` →
  `require_auth()`.
- Headers: `Content-Type: <mime>` (or `thumb_mime`), `Content-Length`,
  `Cache-Control: private, max-age=3600`, `ETag: "<sha1>"` (304 handling),
  `X-Content-Type-Options: nosniff`, `Content-Disposition: inline`.
- Streamed via `fpassthru`-style read on the PDO LOB (or `PDO::PARAM_LOB`
  fetch → echo), not `json_response`.
- **Range requests are out of scope for v1** (full-response only). Note for
  future: `<video>` embedding in articles wants `Accept-Ranges: bytes`.
- Fragment order in `build.php` `$parts`: insert `'asset.php'` after
  `'api.php'`. Router branch goes before the SPA fall-through in `router.php`.

## Frontend

- **`lib/api.ts`**: `uploadRequest<T>(module, action, formData)` — fetches
  without the JSON `Content-Type`; and `assetUrl(id, thumb=false)` →
  `?module=asset&id=…&thumb=1`.
- **`lib/pages.ts`**: `Asset` type + `assetsApi` (`list`, `get`, `create`,
  `update`, `remove`) mirroring `pagesApi` patterns.
- **`lib/assets.ts`** (new): `makeImageThumb(file)` and `makeVideoThumb(file)`
  — canvas pipeline described above; returns `{thumb, width, height, duration}`.
- **`pages/assets.tsx`** (new): header + upload dropzone (drag & drop +
  click, multiple, progress per file, per-file error), kind filter tabs
  (All / Images / Videos), search box (name), paginated grid of thumbnails
  (image thumb or video poster; video-glyph placeholder if none). Each card:
  thumb, name, mime/kind badge, size, dimensions/duration, uploader, date,
  actions: **Copy markdown link** (`?module=asset&id=N`), **Delete** (confirm
  dialog). Glossy `glass-control` cards consistent with existing pages.
- **`router.tsx`**: `/assets` route + `assets` nav link (authenticated only);
  add `/assets` to the `needsAuth` check in `RootLayout`.
- **`i18n.ts`**: `assets.*` keys under both `en` and `zh` (upload, grid,
  actions, errors, size labels).

## RBAC / seed change (db.php)

Add `'assets.upload'` to the `$permissions` array and to the `editor` role's
list in `seed_rbac()`. Because a new migration (0007) triggers a migration
run, `seed_rbac()` executes with the new codes and `admin` auto-links to it.
`assets.delete` is not a separate permission — ownership + admin wins.

## dev.sh / deployment notes

- dev.sh: `php -S "0.0.0.0:$PORT" -d upload_max_filesize=256M -d post_max_size=256M -d max_file_uploads=50 "$ROOT/dist/index.php"`.
- AGENTS.md/README: document the matching php.ini settings for production
  (`post_max_size` must be ≥ largest video you allow).

## Implementation order

1. `0007_assets.sql` + `seed_rbac` permission + build wiring (`asset.php`
   skeleton, router branch). Verify migration runs.
2. `assets.*` API actions + binary serving; curl smoke tests (multipart
   upload, magic-byte MIME, 413 on oversize, list/get, 304 on ETag).
3. `lib/api.ts` helper + `lib/pages.ts` assetsApi + `lib/assets.ts` thumbs.
4. `/assets` page + route + nav + i18n.
5. dev.sh flags + AGENTS.md docs; `pnpm run typecheck` + `php build.php`.

## Verification

- `curl -F file=@small.png ...assets.create` → 201; re-upload different
  content, confirm `md5` dedupe.
- `curl` a >15 MiB image (via `Content-Length` and via `php://input` full
  read) → 413; a `.svg` and a `.txt` renamed to `.png` → 415.
- `curl -I '?module=asset&id=1&thumb=1'` → correct `Content-Type`/`ETag`;
  `If-None-Match` → 304.
- No browser-based verification (per AGENTS.md); rely on typecheck + build +
  curl + code inspection.

## Resolved decisions

1. **SVG** — rejected for stored assets (XSS-safe; served assets are never
   `image/svg+xml`).
2. **`is_public`** — included, **defaults to true** (`1`); `0` restricts
   serving to authenticated users. Enables article embedding without auth.
3. **File limits** — effective caps computed at runtime as
   `min(desired cap, php ini limits, sqlite SQLITE_MAX_LENGTH)`.
4. **md5 dedupe** — duplicate uploads return the existing row
   (`200 {asset, duplicate: true}`) instead of inserting.
