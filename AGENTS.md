# AGENTS.md

## Package manager

- The repo is a **pnpm workspace** rooted at the repo root (`pnpm-workspace.yaml`
  lists `admin_ui` and `ui_sdk`). **Always use `pnpm`** — never `npm`, `yarn`,
  or `npx install`.
- pnpm 11 settings (e.g. `allowBuilds`) live in `pnpm-workspace.yaml`, not in
  `package.json`.
- Install / add / build commands (run from the repo root or the package dir):

  ```bash
  pnpm install        # installs from pnpm-lock.yaml at repo root
  cd admin_ui
  pnpm add <pkg>      # add a dependency to the admin UI
  pnpm run typecheck  # tsc --noEmit (admin_ui + ui_sdk)
  pnpm run format     # biome format --write .
  pnpm run build      # tsc --noEmit && vite build -> admin_ui/dist/
  ```

  `pnpm run build` type-checks before bundling, so it fails on type errors.

- `pnpm-lock.yaml` is committed at the repo root; `package-lock.json` must not
  exist.

## Build

```bash
php build.php          # dev build  -> dist/index.php (incl. dev.php)
php build.php release  # release    -> dist/sifpress.php  (no dev.php)
php buildfront.php     # sifront bundles -> dist/<name>.sifront (dev)
php buildfront.php release
./rel.sh               # shorthand for `php build.php release`
```

- `build.php` and `buildfront.php` share helpers via `build_common.php`
  (`run()`, `inline_assets()`); each drives its own pipeline.
- `build.php` runs `pnpm run build` in `admin_ui/`, inlines the built
  JS/CSS into the HTML, embeds it as `EMBEDDED_HTML`, and assembles the
  PHP fragments from `src/` (in order: `env.php`, `bootstrap.php`,
  `urlmode.php`, `db.php`,
  `migration.php`, `auth.php`, `api.php`, `storage.php`, `asset.php`,
  `sifront.php`,
  `spa.php`, `embed.php`, `migrations.php`, `backup.php`, `dev.php`,
  `router.php`)
  into the single artifact. (Plus `update.php`, `demo_page.php`,
  `seo.php`, `tracking.php`, `favicon.php`, `ui_sdk_serve.php`,
  `cli.php`.)
- `buildfront.php` builds every pnpm package under `sifronts/` and
  packages it into `dist/<name>.sifront` — a ZIP with exactly two
  entries: `meta.json` (identity + `version` from `package.json` +
  `require_keys`) and `bundle.js` (the Vite app bundle with its CSS and
  fonts inlined). It also writes the plain `dist/<name>.meta.json` /
  `dist/<name>.bundle.js` companions the dev disk fast-path reads. The
  admin UI unpacks the ZIP in the browser (JSZip) and posts the two
  pieces; the backend stores `bundle`/`meta`/`version` and never opens a
  ZIP. It never touches the PHP artifact.
- **Sifront serving**: `serve_sifront_page()` (`src/spa.php`) wraps a
  bundled sifront in a server-generated HTML shell (theme bootstrap +
  `<meta name="sifront_meta">` + the ui-sdk/module + `bundle.js`),
  while `serve_sifront_bundle()` streams `bundle.js` from the stored
  bytes at `?p=sifpress/sifront-bundle&id=N&v=version&h=md5`. The `h`
  content hash keeps the URL unique across same-version re-uploads even
  though the endpoint is `immutable`. A row with
  legacy HTML `content` and no bundle is still served verbatim.
- **Dev vs release**: dev builds include `src/dev.php`
  (`?p=dev&action=initData`, an admin-gated demo-data seeder) and define
  `SIFPRESS_DEV`. Release builds exclude that fragment **and** strip its
  dispatch region from `router.php`, so `dist/sifpress.php` contains no
  trace of the dev endpoint. `dev.sh` always makes dev builds; use
  `rel.sh` for releases.
- **Built-in sifront**: migration `0015` seeds the construction sifront
  (fixed id `1001`, empty content) as the default active sifront;
  migration `0020` renames it to `sifpress_in_construction` and flags it
  `is_virtual`. Virtual rows render the construction fallback and reject
  update/delete (they can still be activated). A real theme (`sifpress1`)
  is created through the normal admin flow. `buildfront.php` writes
  `dist/<name>.{sifront,meta.json,bundle.js}`; the plain companions exist
  for the dev injection flow: `dev.sh` runs `php dist/index.php inject_sifront
  sifpress1` after every rebuild, and `?p=sifpress/dev&action=injectSifront`
  does the same over HTTP.
- `dist/*.php` are build artifacts and are gitignored. Never edit them
  directly; edit `src/*.php` instead.
- **Configuration**: on first request the artifact looks for
  `sifpress_config.php` in the same directory as the running PHP file.
  If absent, a default config is auto-generated. Config uses `define()`
  constants (WordPress-style) so direct HTTP access never leaks values.
  See `SIFPRESS_DB_DIR`, `SIFPRESS_ADMIN_PASSWORD`, `SIFPRESS_MANIFEST_URL`,
  `SIFPRESS_BASE_URL`, `SIFPRESS_BACKUP_DIR` (required by `backup`, no
  default), `SIFPRESS_BACKUP_KEEP` (default 90) and `SIFPRESS_BACKUP_PREFIX`
  (default: artifact name), plus the session/throttle knobs
  `SIFPRESS_SESSION_IDLE_TTL` (12h), `SIFPRESS_SESSION_ABSOLUTE_TTL` (7d),
  `SIFPRESS_SESSION_MAX_PER_USER` (5), `SIFPRESS_LOGIN_MAX_FAILURES` (5),
  `SIFPRESS_LOGIN_IP_MAX_FAILURES` (20) and `SIFPRESS_LOGIN_LOCK_WINDOW`
  (900s). Session constants are read from the config at runtime, so changing
  them needs no rebuild. `SIFPRESS_ASSET_DIR` (default
  `<SIFPRESS_DB_DIR>/assets`) is the folder holding uploaded asset bytes; it
  must stay outside `DOCUMENT_ROOT`, `SIFPRESS_ASSET_BACKEND` (`fs`) picks the
  storage implementation, and `SIFPRESS_ASSET_HANDOFF`
  (`''` | `x-accel` | `sendfile` | `auto`) plus `SIFPRESS_ASSET_ACCEL_PATH`
  (`/protected-assets`) decide whether the web server moves the bytes.
  Env vars (`SIFPRESS_DB_DIR`, `SIFPRESS_ADMIN_PASSWORD`,
  `SIFPRESS_UPDATE_MANIFEST_URL`, `SIFPRESS_BASE_URL`) are still supported as
  fallbacks for backward compatibility.
  `SIFPRESS_PRETTY_URLS` (`'auto'` | `'1'` | `'0'`) picks which URL form the
  app *emits* — see "URL modes" below.
- **CLI**: `php sifpress.php [setup|migrate|change_password|sessions|assets|inject_sifront|update_sifront|backup|config|cron|rewrite|status|version|help]`
  (default `setup`). `setup` writes `sifpress_config.php` + the DB folder as the
  invoking user — the way to bootstrap when the docroot is not writable by the
  web user; when run as root the created files are chowned to the artifact's
  owner. `migrate` applies pending migrations + seeds (same as the web
  `?p=sifpress/migration&action=run`). `change_password <user> <password>` sets
  a password and clears `must_change_password` (and revokes every session of
  that user). `sessions` prints the effective policy + the live sessions;
  `sessions purge` deletes expired sessions and login-attempt rows older than
  30 days (otherwise only swept on sign-in); `sessions revoke <user>` signs
  a user out everywhere — the incident-response lever when no UI is at hand.
  `assets status` reports where every asset's bytes live (storage vs BLOB, disk
  bytes, missing objects, orphans); `assets migrate-blobs [--dry-run]
  [--limit=N] [--keep-blobs=0]` moves legacy BLOB rows into storage;
  `assets verify [--sample=N]` md5-checks stored objects; `assets gc` deletes
  objects no row points at and sweeps expired chunked uploads. `migrate` also
  runs `db_housekeeping()` on its "already up to date" path, so finishing
  `migrate-blobs` is immediately followed by the column cleanup. `--keep-blobs` defaults **on** so a rollback to the
  previous artifact still serves the bytes; clearing them only shrinks the file
  after a VACUUM.
  `inject_sifront [name]`
  (dev-only) reads the `dist/<name>.{meta.json,bundle.js}` companions and
  upserts + activates that sifront through the normal storage columns.
  `update_sifront <file.sifront> [--name=NAME] [--activate]` extracts a real
  `.sifront` archive by shelling out to the system `unzip(1)` (into a temp dir,
  so no php-zip / ext-zip dependency) and upserts it by name, creating the row
  when new; `--activate` makes it the active sifront. `backup [--dir=PATH]
  [--keep=N] [--dry-run]` snapshots the DB with `VACUUM INTO` (WAL-safe) and
  tars it to `<SIFPRESS_BACKUP_DIR>/<prefix>-<Ymd-His>.tgz` via the system
  `tar(1)`, then prunes to `SIFPRESS_BACKUP_KEEP` newest; it fails when
  `SIFPRESS_BACKUP_DIR` is unset. The archive holds `sys.db` **plus the asset
  directory** (under its own name, so restoring is a straight copy back into
  `SIFPRESS_ASSET_DIR`); `--dry-run` lists both. `config [--show-secrets]` lists
  values and
  `config --set KEY=VALUE` rewrites `define()` values in place with a
  tokenizer (preserves comments, writes a `.bak`). `cron install|show|remove`
  manages a marked backup block in a user's crontab.
  `rewrite [apache|nginx|both|check|status]` prints (or `--out=`) the server
  rules that map clean paths onto the `?p=` protocol, `check` probes the live
  URLs, `status` prints the resolved mount/mode, `--forget` clears the
  clean-path marker and `--set-config` pins `SIFPRESS_PRETTY_URLS=1`. See
  "URL modes" below. `version` prints the
  Sifpress version (and the artifact path) followed by every installed sifront
  with its version and flags (`virtual`, `legacy html`, `active`) — handy to
  confirm what a deployment is running. See `src/backup.php`
  and `src/cli.php`.

## URL modes (`src/urlmode.php`)

`?p=` is the protocol; clean paths are an optional, purely cosmetic second
spelling of the same routes.

- **Resolution.** `request_route()` reads `?p=`, and when it is absent falls
  back to `REQUEST_URI`'s path (or `PATH_INFO`), normalising it
  (`normalize_route()`: percent-decode, collapse `.`/`..`/empty segments, cap
  512 chars). `mount_path()` — from `SCRIPT_NAME`, or `SCRIPT_FILENAME` minus
  `DOCUMENT_ROOT` under the built-in server — is stripped from both, so the
  nginx rule `try_files $uri $uri/ /app/index.php?p=$uri` works verbatim at any
  mount depth.
- **Emission.** `route_path()` / `route_url()` build every generated link
  (canonical, og:image, sitemap, robots, asset/avatar payloads, the sifront
  shell, favicon) in the active form, so no route is spelled out in `?p=`
  notation anywhere else — the only exceptions are `urlmode.php` itself,
  robots.txt (which needs a path, not a document-relative query) and the
  needle `apply_ui_sdk_version()` matches against the build-time admin HTML.
  Query mode stays document-relative (`?p=…`); pretty mode is mount-aware
  (`/app/sifpress/asset?id=7`).
- **Mode.** `SIFPRESS_PRETTY_URLS`: `'1'`/`'0'` force it, `'auto'` (default)
  switches on the first *observed* clean-path request and remembers it in
  `<db_dir>/pretty_urls` (written `@`-silently, deleted by `rewrite --forget`).
  Evidence-based on purpose: an install whose rules were removed keeps
  emitting links that work.
- **Aliases.** `robots.txt`, `sitemap.xml` and `favicon.ico` are matched in
  `router.php` on the resolved route *before* the `sifpress/` branch, so they
  need the rules (or PATH_INFO) to arrive at all.
- **Client.** `base_url_meta()` injects `window.SIFPRESS_MOUNT`,
  `window.SIFPRESS_PRETTY_URLS` and matching `<meta>` tags. In ui-sdk,
  `appBaseUrl()` returns the mount in pretty mode (the document may be an
  article), `moduleUrl()`/`apiUrl()`/`assetUrl()`/`loadUiChunk()` branch on it,
  and `createQueryRewrite()`'s `input` accepts a bare path (strip mount, then
  module prefix) while `output` writes `mount + prefix + route`. Both spellings
  resolve in both modes, so a bundle cached before the feature keeps working.
- **Dev.** PHP's built-in server routes every URI to the artifact, so
  `curl localhost:5000/sifpress/admin/login` exercises the whole path — the
  dev box therefore also flips the mode to pretty on the first clean-path
  request (`php dist/index.php rewrite --forget` to reset).

## Development server

```bash
./dev.sh          # serves http://localhost:5000
SIFPRESS_PORT=8080 ./dev.sh
```

- Runs the build once, then serves `dist/index.php` with PHP's built-in
  server on port 5000.
- Watches `src/`, `admin_ui/src/`, `admin_ui/index.html`, and `ui_sdk/src/`
  with `inotifywait`; on change it re-runs `php build.php` and you reload the
  page.
- PHP is re-parsed per request, so PHP logic changes only need a rebuild
  (no server restart).
- dev.sh uses the default PHP settings (no `-d` overrides), so asset uploads
  are bounded by the local `php.ini` `upload_max_filesize`/`post_max_size`
  (defaults 2M/8M). For a single-shot upload the effective cap is
  `min(desired cap, php ini limits, SQLite SQLITE_MAX_LENGTH)`, so a deployment
  that wants large *single-request* uploads must raise those values in its own
  php.ini — `post_max_size` truncates the body before any app code runs. The
  chunked upload path deliberately ignores the php.ini limit (no request carries
  more than one part), which is how files larger than `post_max_size` get in.
- dev.sh serves from `dist/` (its own cwd becomes `DOCUMENT_ROOT`, which is what
  the built-in server actually exposes) and points `SIFPRESS_ASSET_DIR` at
  `var/sifpress/assets` in the repo (gitignored), persisting it into
  `dist/sifpress_config.php` so CLI runs and the web server agree on one asset
  directory. The default `<db_dir>/assets` would sit inside `dist/`, i.e. inside
  the dev docroot, and the app refuses that.

## Project layout

```
migrations/         SQL migration scripts (authoring source of truth, embedded
  NNNN_*.sql        at build time; never edited once applied — add new ones)
src/                PHP source fragments (edit these)
  env.php           PHP version/extension/FTS5 requirements (assembled first,
                    before config + DB; fails with an install message)
  bootstrap.php     constants + core helpers
  db.php            SQLite open, pragmas, migration detect/runner, seeds
  migration.php     ?p=migration handler (status / run)
  auth.php          sessions, RBAC, page grants
  api.php           JSON API handler
  storage.php       asset storage interface + filesystem backend (uuid keys)
  asset.php         ?p=asset binary serving (storage objects + legacy blobs)
  demo_page.php     shared markdown-demo page (virtual page + dev seed)
  urlmode.php       `?p=` / clean-path route resolution + mode-aware links
  seo.php           settings store + sitemap/robots + head meta injection
  tracking.php      analytics tracking head tags
  favicon.php       ?p=favicon serving (icon + apple-touch-icon)
  sifront.php       sifront archive reading (system unzip) + bundle cap + store
  spa.php           SPA serving / meta injection / sifront shell + bundle
  embed.php         EMBEDDED_HTML region (regenerated by build.php)
  migrations.php    MIGRATIONS region (SQL scripts embedded by build.php)
  backup.php        DB snapshot/tar/prune + crontab management
  cli.php           CLI: setup / migrate / update_sifront / backup / config / cron / status
  dev.php           dev-only ?p=dev handler (dev builds only)
  router.php        main router
ui_sdk/             reusable UI SDK (pnpm workspace package "ui-sdk")
  src/              TypeScript source (consumed directly, no separate build)
    api.ts          fetch wrappers (moduleRequest/apiRequest/uploadRequest,
                    assetUrl/avatarUrl, copyText, ApiError)
    pages.ts        typed API objects (system/settings/tracking/auth/pages/
                    users/roles/tags/assets/migration APIs) + shared types
    assets.ts       browser thumbnail/avatar generation (image/video)
    upload.ts       chunked resumable uploader (parts, retry, resume, progress)
    auth.tsx        AuthProvider + useAuth (React context over react-query)
    update.ts       updateApi (version check / self-upgrade)
    base-url.ts     appBaseUrl() / mountPath() / prettyUrls() (URL mode)
    rewrite.ts      createQueryRewrite() — the TanStack Router ?p= rewrite pair
    index.ts        barrel (re-exports everything as "ui-sdk")
  package.json      name "ui-sdk", peer-deps on react/react-query/router
admin_ui/           Admin React app (pnpm workspace package "sifpress-admin-ui")
  src/              TypeScript + React + Tailwind v4
    routes/         file-based routes (TanStack Router)
      __root.tsx    root layout (AppHeader, footer, auth gate)
      index.tsx     /
      article.tsx   /article (with ?tag= search)
      article.$slug.tsx  /article/$slug
      login.tsx     /login
      editor/       /editor/*
      account.tsx   /account
      settings.tsx  /settings
      assets.tsx    /assets
      $.tsx         catch-all 404
    routeTree.gen.ts  auto-generated route tree (do not edit)
    router.tsx      createRouter + ?p= rewrite config (via ui-sdk rewrite)
    pages/          page components
    lib/            UI libs (md-editor/, agent/, diff/, theme, i18n, utils,
                    logger, front-matter, format) — API layer lives in ui_sdk
    components/ui/  shadcn/ui components
  components.json   shadcn config (style "radix-nova", aliases @/*)
  tsconfig.json     strict; paths @/* -> ./src/*, ui-sdk -> ../ui_sdk/src
build.php           assemble src/ + inlined bundle -> dist/*.php (dev/release)
build_common.php    shared build helpers (run, inline_assets, inline_css_urls, zip_create)
buildfront.php      sifront ZIP bundles -> dist/<name>.sifront (dev/release)
rel.sh              release build -> dist/sifpress.php
dev.sh              dev build + serve (watch) -> dist/index.php
dist/               build artifacts (gitignored)
  sifpress_config.php  auto-generated config (NOT gitignored, persists across rebuilds)
sifronts/           public-facing sifront SPAs (each a pnpm workspace package,
  sifpress1/        built by buildfront.php into dist/sifpress1.sifront
  src/routes/       file-based routes: / (home + tag filter), /article/$slug, $ (404)
  src/components/   site-header/footer, article-card/list, sidebar, glass system
  sifpress2/        editorial/news sifront -> dist/sifpress2.sifront
  src/routes/       / (front page + ?q= search), /archive, /section/$section,
                    /article/$slug, $ (404)
  src/components/   masthead, lead story + latest rail, section blocks, newsletter,
                    story cards, article furniture (byline/share/TOC/progress)
  src/lib/          theme-config (`sifpress2.*` KV keys), format, stories (view models)
  Design: flat newsprint — hairline rules, Newsreader/Inter, no glass; theme keys
  live in meta.json `require_keys` under the `sifpress2.` namespace. UI copy is
  **one key per string** (`sifpress2.copy.viewAll`, 20 of them), not one JSON
  blob: `DEFAULT_COPY` in `sifronts/sifpress2/src/lib/theme-config.tsx` is the
  single source of their names, so `KEYS` (the batch request), the
  `require_keys` list and the admin KV rows all follow from it. Per string,
  `buildCopy()` resolves stored key -> legacy `sifpress2.copy` blob (pre-0024
  installs) -> `meta.json` default -> built-in.
  Both sifronts annotate every KV-driven element with `kvAttrs(...)`
  (`kv('masthead.kicker')` in sifpress2) and mount `InspectOverlay` in their
  ThemeConfigProvider — see "KV inspect mode" below.
- **KV inspect mode** (`ui_sdk/src/inspect.tsx`): load any sifront with
  `?inspect=1` (any value except empty/`0`/`false`/`off`/`no`) and every
  element that renders a KV value is outlined with its key printed on the
  label. Stored keys are solid red; keys with **no** stored value (the theme
  is showing its built-in default) are dashed amber with a `· default` suffix,
  and the bottom-left legend counts what is on the page and lists declared
  keys that are not rendered here (native tooltip).
  - Mechanics: the overlay is a single fixed `pointer-events: none` layer
    (`#sifront-inspect-layer`, max `z-index`) positioned from
    `getBoundingClientRect()` in one `requestAnimationFrame` loop, so nothing
    in the page layout moves and boxes track scroll/resize/lazy images without
    observers. `html[data-sifront-inspect="on"]` is the styling hook.
  - The loop re-reads `window.location.search` each frame, so the mode follows
    SPA navigation and drops out when the param leaves the URL.
    `createQueryRewrite(base, prefix, ['inspect'])` keeps the param in the
    address bar (routes' `validateSearch` would otherwise drop it).
  - `createKvInspector({ values, declaredKeys })` holds the DOM machinery
    (framework-free, unit-testable in Node with a stub DOM);
    `InspectOverlay` is the thin `useEffect` wrapper over it. A nested key falls
    back to its parent KV, so a pre-split `sifpress2.copy` blob still reads
    (`sifpress2.copy.viewAll`).
  - Annotate with `{...kvAttrs('sifpress1.footer.text')}` (or sifpress2's
    `kv('footer.text')` helper) — on the element that renders the value, never
    on a `display: contents` wrapper, which has no box to outline.
  - The admin sifront list has an "Inspect KV" button next to Preview that
    opens the active sifront with the flag (`withInspect()`).
website/           static project website for GitHub Pages (plain HTML/CSS/JS,
  no build step; published by .github/workflows/pages.yml; see
  website/README.md)
pnpm-workspace.yaml workspace root (packages: admin_ui, ui_sdk, sifronts/sifpress1)
pnpm-lock.yaml      workspace lockfile
```

## Backend model

- **SQLite + FTS5, WAL mode**, at `<folder>/sys.db`. Folder precedence:
  `SIFPRESS_DB_DIR` constant (from `sifpress_config.php`), else
  `SIFPRESS_DB_DIR` env var, else `<DOCUMENT_ROOT>/../sifpress`,
  else `<artifact dir>/var/sifpress`.
- **Migrations**: `migrations/*.sql` are embedded into `dist/index.php` at
  build time. Bootstrap only detects pending migrations; the app serves
  `503 migration_required` (SPA gets an `app-maintenance` meta tag) until
  `POST ?p=migration&action=run` applies them (per-migration
  `BEGIN IMMEDIATE` transaction). A migration that only marks a code-side data
  step is fine (see `0024_sifront_copy_split.sql`, whose work is
  `normalize_sifront_copy_kv()` in `db_migrate_and_seed()`): the SQL file makes
  the runner reach the PHP step on installs whose schema is already current.
- **Chunked resumable upload** (migration `0026`): `assets.upload.create` hands
  the client a `part_size` derived from `asset_php_upload_limit()` (a chunk is a
  raw request body, so `post_max_size` truncates it like a whole file would) and
  the list of parts already stored; `assets.upload.part` PUTs one chunk;
  `assets.upload.complete` (multipart, because the client thumbnail rides along)
  re-runs the single-shot validation — magic-byte sniffing, cap for the detected
  kind, md5 — then stores the object and inserts the row.
  - Parts stage on disk at `<asset_dir>/staging/<token>.part` with
    `flock(LOCK_EX)` and an offset derived from the part index, so a client
    cannot write outside its upload; rows expire after 24h and
    `asset_upload_purge_expired()` runs on create and in `assets gc`.
  - **This is what lifts the per-file ceiling**: `asset_effective_cap($kind,
    $chunked = true)` skips the php.ini limit, because no single request carries
    the whole file. A single-shot `assets.create` is still bounded by
    `post_max_size` (≈2 MB on a stock host).
  - Resume: `ui_sdk/src/upload.ts` (`uploadAssetResumable`) keeps the upload id
    plus received parts in `localStorage` keyed by `name:size:lastModified`, and
    `create` reattaches to a matching, unexpired reservation owned by the same
    user — so a retry sends only what is missing. 3 parts in flight, exponential
    backoff with jitter, 4xx treated as final, and progress derived from
    completed parts (`fetch` has no upload progress event).
- **Asset bytes live in files, not the DB** (`src/storage.php`; the full story,
  including what is deliberately still open, is `plan/asset-storage-plan.md` —
  phases 1–7 shipped, object storage is the only one left). The row keeps
  owning identity (name, mime, size, md5) and access control (`is_public` +
  `asset_grants`); only bytes move. `assets.storage` is the backend id (`fs`
  today), `assets.storage_key` / `thumb_key` the opaque keys, and both are NULL
  for rows still holding BLOBs — `serve_asset()` reads either source, so old
  and new artifacts interoperate while `assets migrate-blobs` moves rows.
  - **Keys**: `ab/cd/<uuid4>.<ext>`, two hex fan-out levels; `ext` comes from
    the *sniffed* MIME (`ASSET_EXT_FOR_MIME`), never the client filename, and
    `asset_key_is_valid()` gates every filesystem path against traversal. The
    directory defaults to `<db_dir>/assets` and **must stay outside
    `DOCUMENT_ROOT`** — assets are reachable only through `?p=asset`, which
    enforces the grants. `localPath()` is the seam for an eventual
    `X-Accel-Redirect` handoff, and `id()` for a future S3 backend.
  - **Writes**: temp file in `.tmp/` + `rename()` (atomic, never a partial
    object), md5 recorded as `storage_etag`; the row is written *after* the
    object exists, and deletes remove the row first so a failure can never
    strand a live row.
  - **Serving**: identical contract from either source (ETag `"asset-<id>"`,
    `Range`/206/416, `Accept-Ranges`, `Content-Disposition`, `nosniff`);
    storage rows stream through `stream_asset_object()` in 256 KiB chunks, so
    memory stays flat for hundreds of MB.
  - **Web-server handoff** (phase 7): with `SIFPRESS_ASSET_HANDOFF` set to
    `x-accel` (nginx) or `sendfile` (Apache; `auto` picks one), `?p=asset` does
    the access checks and then emits `X-Accel-Redirect: <SIFPRESS_ASSET_ACCEL_PATH>/<key>`
    or `X-Sendfile: <abs path>` instead of streaming bytes — Range and all, which
    is the point, since a `<video>` seek is one request per seek and each one
    would otherwise pin a PHP worker. It is **off by default** because the
    server-side half is operator configuration the artifact cannot write
    (`location /protected-assets { internal; alias …; }` / `mod_xsendfile`); a
    mismatch turns playback into 404s. Anything that is not a local file (object
    storage, a missing object) falls back to the PHP streamer, so the handoff is
    only ever an optimisation.
  - **Phase 5 cleanup**: `drop_legacy_asset_blob_columns()` (from
    `db_housekeeping()`) drops `assets.data`/`assets.thumb` once every row has a
    stored object, and refuses while any row is unmigrated — an unmigrated
    install would lose every asset the instant the column went away. SQLite
    needs >= 3.35 for `DROP COLUMN`; older hosts keep two empty columns. From
    then on every query builds itself around `asset_columns()` /
    `asset_blob_columns()` / `asset_insert_sql()`, so the app works with and
    without them (an artifact older than this release cannot read such a
    database — roll forward, not back). `seed_favicon()` stores the SVG through
    the backend, so a seeded favicon never counts as an unmigrated row.
- **Auth**: DB-backed sessions (`sessions` table, hashed tokens) via an
  `HttpOnly; SameSite=Lax` cookie; `password_hash`/`password_verify`.
  - **Lifetime**: two windows — `SESSION_IDLE_TTL` (12h, slides on use via
    `touch_session()`, rate-limited to one write per hour) and
    `SESSION_ABSOLUTE_TTL` (7d from sign-in, never extended past).
    `lookup_session()` enforces both; timestamps are written with `gmdate()`
    because they are compared against SQLite's UTC clock.
    `SESSION_MAX_PER_USER` (5) is enforced by `prune_user_sessions()` on
    sign-in; `purge_sessions()` sweeps expired rows.
  - **Revocation**: a password change rotates the current token and drops all
    other sessions (`revoke_sessions()`); `users.update` with a password or
    `is_active: 0` drops them too, as does CLI `change_password` /
    `sessions revoke`.
  - **Login throttle**: `login_attempts` (migration `0023`) logs every attempt
    (successes included, so the table is a real audit trail).
    `login_throttle_check()` locks per account *and* per IP — 5 failures
    (20 for the IP key) inside the window returns `429` + `Retry-After`, with
    the lock doubling per further burst up to 24h. A success resets the
    counter (failures older than the last success don't count) without
    deleting audit rows. Unknown usernames still run `password_verify()`
    against `AUTH_DUMMY_HASH` (same bcrypt cost) so timing can't enumerate
    accounts; successful logins rehash when `password_needs_rehash()`.
- **RBAC**: roles ⇄ permissions (`admin`/`editor`/`viewer` seeded
  idempotently); helpers `can()`, `require_permission()`, `is_admin()`.
- **Page ownership**: editing needs `pages.write` AND (author OR a
  `page_grants` row OR admin); grants managed via `pages.grant` /
  `pages.revokeGrant`. Ownership itself can be transferred from the article
  editor (admins always, otherwise only the current owner) by sending
  `created_by` to `pages.update`; the typeahead reads `pages.ownerCandidates`
  (active users with `pages.write`). Owner-only changes never create a
  revision — revisions are content-addressed (see `compute_revision_hash`),
  so ownership and flags stay page attributes.
- **First admin**: `admin`/`admin` (override `SIFPRESS_ADMIN_PASSWORD`) seeded on
  first migration, flagged `must_change_password` — app locks to
  `auth.changePassword` until changed.

## Frontend stack

- **TypeScript (strict) + React 19 + Tailwind CSS v4 + shadcn/ui** (Radix
  primitives, "nova" preset). Installed via `pnpm dlx shadcn@latest`.
- **TanStack Router** handles SPA routing with **file-based route
  definitions** in `src/routes/`. The browser URL `?p=/editor/123` is mapped
  to the internal path `/editor/123` via the router's `rewrite` option in
  `src/router.tsx` (`input`/`output` functions); route changes use
  `pushState`, so back/forward work. The route tree is auto-generated into
  `src/routeTree.gen.ts` by `@tanstack/router-plugin` — never edit it
  directly. Search params are validated with `zod` (e.g. `?tag=` on
  `/article`).
- **TanStack Query** is used for all API calls. Fetch wrappers live in
  `ui_sdk/src/api.ts` (imported as `ui-sdk`); they hit
  `window.location.pathname?p=api&action=...` so the bundle works at any
  mount depth.
- shadcn components are generated into `src/components/ui/` and edited via
  `pnpm dlx shadcn@latest add <name>`. Components.json aliases `@/*` to
  `admin_ui/src/*`.
- Route-aware `<title>` is set per page via `src/hooks/use-page-title.ts`.
- **Theming** (`src/lib/theme.tsx`): `ThemeProvider` + `useTheme` with
  `light` / `dark` / `system` (persisted in localStorage; `system` follows
  `prefers-color-scheme`). A tiny inline script in `index.html` applies the
  stored theme before first paint to avoid FOUC. Dark variants of the glass
  classes live in `index.css`.
- **i18n** (`src/lib/i18n.ts`): `react-i18next` with inline `en`/`zh`
  resources, language persisted in localStorage and synced to
  `document.documentElement.lang`. Add keys in the `resources` object; use
  `useTranslation()` in components.
- **Markdown editor + rendering**: the engine is shared in
  `ui_sdk/src/markdown/` (schema, render pipeline, plugins) and wrapped by
  the app hosts — `MilkdownEditor` in `admin_ui/src/lib/md-editor/editor.tsx`
  (WYSIWYG editor on `/editor`) and `MarkdownView` in
  `ui_sdk/src/markdown/view.tsx` (article display). `createMarkdownEditor()`
  in `ui_sdk/src/markdown/shared.ts` is the single source of truth for the
  schema — it builds the **same** editor for both modes so edit and render
  can't drift.
  - Plugins: `ui_sdk/src/markdown/plugins/` (`mermaid`, `video*`,
    `image-directives` schema) and `admin_ui/src/lib/md-editor/plugins/`
    (editor-only tooltips for image directives + diagrams). `![Alt|640]`
    floats/link extend the commonmark image schema; heading ids come from the
    built-in slug generator (ids in `getHTML` output feed the TOC).
  - **Feature ordering matters**: `codeMirror` must be `addFeature`d before
    `latex` (the Latex feature throws otherwise).
  - Crepe's UI chrome (toolbar, slash menu, tables…) is written in **Vue 3**
    and bundled as a hard dep (~35–45 KB gz) — do not add `@milkdown/react`;
    we mount `CrepeBuilder` directly.
  - Article rendering pipeline: `parseFrontMatter` → `escapeTableCodePipes`
    (tables with pipes in code spans) → `markdownToHtml` (hidden renderer
    singleton + `getHTML()`) → `postProcessHtml` (block math → KaTeX,
    mermaid SVG, video embeds, external links). Hosts that render math must
    load KaTeX's stylesheet, or the hidden `.katex-mathml` layer (incl. the
    raw `application/x-tex` annotation) becomes visible: `admin_ui` gets it
    transitively via `@milkdown/crepe/theme/common/style.css`, while the
    sifront apps import `katex/dist/katex.min.css` in their own `index.css`.
  - Front matter: `parseFrontMatter`/`FrontMatter` live in
    `ui_sdk/src/front-matter.ts`; the admin serialization helpers
    (`buildFrontMatter`, key sets) live in `admin_ui/src/lib/front-matter.ts`,
    which re-exports the parser so call sites keep importing from
    `@/lib/front-matter`.
- **AI assistant (in-editor agent) — "ReAgent"**: `@earendil-works/pi-agent-core` +
  pi-ai run **client-side**. The headless layer lives under
  `admin_ui/src/lib/agent/` (`agent.ts`, `tools.ts`, `editor-mutations.ts`,
  `models.ts`, `config.ts`, `session-store.ts`, `skill-registry.ts`), and the
  React layer under `admin_ui/src/components/agent/` — `core/`
  (`ReAgentProvider` + `useReAgent*` hooks), `ui/` (unstyled-ish parts:
  `ReAgentRoot/Header/MessageList/Message/ToolCall/Composer` +
  `ReAgentSessionsView` + `ui/settings/*`), and the styled preset `reagent.tsx` (`<ReAgent>`).
  `agent-chat.tsx` is a deprecated re-export of the preset. The preset takes a
  `surface` variant — `glass` (default, the frosted panel) or `solid` (a flat
  near-white / near-dark plane; the editor uses `solid`), toggled with a
  `data-surface` attribute that also flattens descendant glass bubbles.
  - **Config**: one `AgentConfig` (`lib/agent/config.ts`, localStorage
    `agent.config`) holds model/thinking, provider base URLs + verified flags,
    system prompt, custom skills, disabled built-ins, and MCP servers; legacy
    per-key localStorage is migrated once at load. The settings UI is a
    **self-contained view inside the component** (gear → `view: 'settings'`
    replaces the chat surface, back button returns), rendered by
    `ui/settings/reagent-settings-view.tsx`. `useReAgentConfig()` reads the
    config via `useSyncExternalStore`, so `/settings` → My Account no longer
    has an Agent tab.
  - **Tools & skills**: built-ins are `AgentToolDescriptor`s
    (`lib/agent/tools.ts`); `config.toolsDisabled` switches them off and
    consumers inject custom tools through the provider. Built-in skills
    (`lib/agent/skill-registry.ts`) merge with user custom skills; tool labels
    and the settings UI are generated from the registries.
  - **Sessions**: active-only, stored in IndexedDB v2
    (`lib/agent/session-store.ts`). `AgentSession.parentId` + `forkFromIndex`
    form a fork tree shown by `ReAgentSessionsView` (a `view: 'sessions'`
    surface that replaces the chat, same as settings); delete reparents
    children.
  - The editor write tools only *stage* changes and open the review dialog
    (they never persist). **Selection revision**: a whole-block selection can
    be rewritten via `get_selection`/`update_selection` and only that range is
    replaced (`plan/selection-revision-plan.md`); a clamped selection always
    starts a **fresh root** session. **MCP** (`mcp.ts`): remote servers over
    Streamable HTTP, adapted to `AgentTool`s. Exa (`https://mcp.exa.ai/mcp`) is
    auto-enabled; tools are namespaced `mcp__exa__<tool>`. The Exa API key
    lives in localStorage (Settings → Agent) with an in-component prompt on
    auth failure. See `plan/mcp-support-plan.md` and
    `plan/agent-component-revamp.md`.
- **Glass design system** in `index.css` (`@layer components`):
  `glass-control` (frosted surfaces — applied by default to `Card`),
  `apple-panel` (chrome — used by the nav pill), `ambient-bg` (page
  backdrop that the glass blurs, applied to the full-viewport wrapper in
  `RootLayout`). All translucency is `color-mix(in oklch, var(--...),
  transparent)` from theme tokens; `prefers-reduced-motion` and
  `prefers-reduced-transparency` guards are included.

## Conventions

- **Never install or attempt to run a browser** (Chromium, Chrome, Playwright,
  Puppeteer, Firefox, etc.) in this environment — the required system
  libraries are unavailable and must not be installed. There is no
  browser-based verification; rely on `pnpm run typecheck`, `php build.php`,
  curl, and code inspection instead.
- **Biome is the formatter** for each TS package, configured per package
  (`admin_ui/biome.json`, `ui_sdk/biome.json`, `sifronts/sifpress1/biome.json`,
  `sifronts/sifpress2/biome.json`;
  linter disabled — formatter only). Run `pnpm run format` in the package you
  edited. **Biome only sees files inside the config's directory**, so the
  admin_ui script does NOT format `ui_sdk` — run `pnpm run format` in `ui_sdk`
  too. Enforced style: semicolons at statement ends, trailing commas, single
  quotes, 2-space indent, 100-col width, scope `src/**/*.{ts,tsx}` +
  `vite.config.ts`; Biome must NOT touch `index.css` (Tailwind v4 syntax breaks
  its CSS parser) or other files.
- **Prose typography overrides must be unlayered.** In Tailwind v4 the
  `@tailwindcss/typography` plugin emits its default `.prose` tokens into the
  `utilities` layer, which outranks `components`-layer rules no matter their
  specificity. To override `.prose` colors/variables (e.g. for dark mode),
  write the override outside any `@layer` block (unlayered CSS always wins).
  See the `.prose.prose` block in `admin_ui/src/index.css`.
- PHP fragments in `src/` have no `<?php` tag or `declare(strict_types=1)`
  — `build.php` adds both at the top of the assembled file.
- Do not add comments to code unless asked; docblocks in fragments are fine.
