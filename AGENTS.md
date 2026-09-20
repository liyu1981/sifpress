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
  PHP fragments from `src/` (in order: `bootstrap.php`, `db.php`,
  `migration.php`, `auth.php`, `api.php`, `asset.php`, `sifront.php`,
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
  (default: artifact name).
  Env vars (`SIFPRESS_DB_DIR`, `SIFPRESS_ADMIN_PASSWORD`,
  `SIFPRESS_UPDATE_MANIFEST_URL`, `SIFPRESS_BASE_URL`) are still supported as
  fallbacks for backward compatibility.
- **CLI**: `php sifpress.php [setup|migrate|change_password|inject_sifront|update_sifront|backup|config|cron|status|help]`
  (default `setup`). `setup` writes `sifpress_config.php` + the DB folder as the
  invoking user — the way to bootstrap when the docroot is not writable by the
  web user; when run as root the created files are chowned to the artifact's
  owner. `migrate` applies pending migrations + seeds (same as the web
  `?p=sifpress/migration&action=run`). `change_password <user> <password>` sets
  a password and clears `must_change_password`. `inject_sifront [name]`
  (dev-only) reads the `dist/<name>.{meta.json,bundle.js}` companions and
  upserts + activates that sifront through the normal storage columns.
  `update_sifront <file.sifront> [--name=NAME] [--activate]` extracts a real
  `.sifront` archive by shelling out to the system `unzip(1)` (into a temp dir,
  so no php-zip / ext-zip dependency) and upserts it by name, creating the row
  when new; `--activate` makes it the active sifront. `backup [--dir=PATH]
  [--keep=N] [--dry-run]` snapshots the DB with `VACUUM INTO` (WAL-safe) and
  tars it to `<SIFPRESS_BACKUP_DIR>/<prefix>-<Ymd-His>.tgz` via the system
  `tar(1)`, then prunes to `SIFPRESS_BACKUP_KEEP` newest; it fails when
  `SIFPRESS_BACKUP_DIR` is unset. `config [--show-secrets]` lists values and
  `config --set KEY=VALUE` rewrites `define()` values in place with a
  tokenizer (preserves comments, writes a `.bak`). `cron install|show|remove`
  manages a marked backup block in a user's crontab. See `src/backup.php`
  and `src/cli.php`.

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
  (defaults 2M/8M). The app computes its effective per-asset cap at runtime
  as `min(desired cap, php ini limits, SQLite SQLITE_MAX_LENGTH)`, so a
  deployment that wants large uploads must raise those values in its own
  php.ini — `post_max_size` truncates the body before any app code runs.

## Project layout

```
migrations/         SQL migration scripts (authoring source of truth, embedded
  NNNN_*.sql        at build time; never edited once applied — add new ones)
src/                PHP source fragments (edit these)
  bootstrap.php     constants + core helpers
  db.php            SQLite open, pragmas, migration detect/runner, seeds
  migration.php     ?p=migration handler (status / run)
  auth.php          sessions, RBAC, page grants
  api.php           JSON API handler
  asset.php         ?p=asset binary blob serving (assets + thumbnails)
  demo_page.php     shared markdown-demo page (virtual page + dev seed)
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
    auth.tsx        AuthProvider + useAuth (React context over react-query)
    update.ts       updateApi (version check / self-upgrade)
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
  sifpress1/        built by build.php into dist/sifpress1.sifront)
  src/routes/       file-based routes: / (home + tag filter), /article/$slug, $ (404)
  src/components/   site-header/footer, article-card/list, sidebar, glass system
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
  `BEGIN IMMEDIATE` transaction).
- **Auth**: DB-backed sessions (`sessions` table, hashed tokens) via an
  `HttpOnly; SameSite=Lax` cookie; `password_hash`/`password_verify`.
- **RBAC**: roles ⇄ permissions (`admin`/`editor`/`viewer` seeded
  idempotently); helpers `can()`, `require_permission()`, `is_admin()`.
- **Page ownership**: editing needs `pages.write` AND (author OR a
  `page_grants` row OR admin); grants managed via `pages.grant` /
  `pages.revokeGrant`.
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
- **AI assistant (in-editor agent)**: `@earendil-works/pi-agent-core` +
  pi-ai run **client-side** under `admin_ui/src/lib/agent/` (`agent.ts`,
  `tools.ts`, `editor-mutations.ts`, `models.ts`, `store.ts`). Tools are Pi
  `AgentTool`s; the editor write tools only *stage* changes and open the review
  dialog (they never persist). **Selection revision**: a whole-block selection
  can be rewritten via `get_selection`/`update_selection` and only that range is
  replaced (`plan/selection-revision-plan.md`). **MCP** (`mcp.ts`): remote servers over
  Streamable HTTP, adapted to `AgentTool`s. Exa (`https://mcp.exa.ai/mcp`) is
  auto-enabled; tools are namespaced `mcp__exa__<tool>`. The Exa API key lives
  in localStorage (Settings → Agent) with an in-chat prompt on auth failure.
  See `plan/mcp-support-plan.md`.
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
  (`admin_ui/biome.json`, `ui_sdk/biome.json`, `sifronts/sifpress1/biome.json`;
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
