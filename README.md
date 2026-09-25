<p align="center">
  <img src="https://github.com/liyu1981/sifpress/raw/refs/heads/master/assets/favicon.svg" width="112" height="112" alt="Sifpress logo">
</p>

<h1 align="center">Sifpress</h1>

<p align="center">
  <b>One PHP file. The whole site.</b><br>
  A single-file PHP + React SPA with rewrite-free routing — no <code>.htaccess</code>,
  no <code>try_files</code>, no <code>#/</code> hash routes, no Node.js on the server.
</p>

<p align="center">
  <a href="https://sifpress.liyu1981.xyz/">Website</a> ·
  <a href="https://github.com/liyu1981/sifpress/releases">Releases</a> ·
  <a href="AGENTS.md">Development guide</a>
</p>

---

## What it is

Sifpress compiles a PHP JSON API, a full React admin app, its styles and the
SPA HTML into a single **`sifpress.php`** artifact — migrations included. Drop
it into any directory of any PHP host and it just runs.

| | |
| --- | --- |
| **1** production file | everything inlined — no asset folder |
| **0** rewrite rules | routing is a query parameter (`?p=…`) every server passes natively |
| **1 request** per page load | JS + CSS are embedded in the HTML |
| **PHP 8.3+** + SQLite | the production server never needs Node.js |

The same file works at `/`, `/myapp/` or four levels deep — no rebuild, no
server configuration.

## Why

- **A deployment is one file.** Copy `sifpress.php`, point PHP at it. A backup
  is that file plus one small DB folder.
- **Nothing to configure on the server.** No `.htaccess`, no Nginx
  `try_files`, no history-mode rewrites, no hash routing. Every URL is real,
  shareable and crawler-friendly.
- **Nothing to keep in sync.** API, admin UI, styles, HTML and SQL migrations
  ship together and upgrade together — including one-click self-update from a
  release manifest.
- **No toolchain in production.** Build on your machine or in CI; production
  is plain PHP.

## Features

- **Admin UI** — React 19 + TanStack Router/Query + Tailwind v4 + shadcn/ui,
  DB-backed sessions, roles (admin / editor / viewer), page-level grants and a
  Milkdown WYSIWYG markdown editor.
- **Content** — articles with tags, front matter and full-text search (SQLite
  FTS5 in WAL mode), asset uploads with browser-generated thumbnails, SEO
  settings with sitemap/robots, analytics head tags.
- **Sifronts** — the public front end is a swappable React theme shipped as a
  two-file `.sifront` archive, uploaded from the admin and served by the
  artifact itself (see [The front: sifronts](#the-front-sifronts)).
- **Operations** — migrations applied on demand, CLI
  (`setup · migrate · change_password · backup · config · cron · status`),
  WAL-safe `VACUUM INTO` backups pruned on a schedule, self-update from a
  `latest.json` manifest.
- **DX** — TypeScript strict, pnpm workspace, Biome, `./dev.sh` live reload,
  releases cut by tags through GitHub Actions.

## Quick start — deploy a release

**Server requirements:** PHP **8.3+** with `pdo_sqlite` (SQLite built with
FTS5), `mbstring` and `fileinfo`. Optional: `curl` and `zlib` (features
degrade gracefully).

```bash
# 1 — download the release artifact
curl -LO https://github.com/liyu1981/sifpress/releases/latest/download/sifpress.php
#    (or take sifpress.php from the Releases page)
mkdir -p /var/www/html
cp sifpress.php /var/www/html/

# 2 — create the config + DB folder (run next to the artifact)
cd /var/www/html
php sifpress.php setup
# want the DB somewhere else? choose the path up front, or adjust later:
php sifpress.php setup --db-dir=/srv/sifpress-db --force
php sifpress.php config --set SIFPRESS_DB_DIR=/srv/sifpress-db

# 3 — apply the embedded migrations and seed the first admin
php sifpress.php migrate
```

Then open the admin UI:

```text
https://example.com/sifpress.php?p=sifpress/admin
```

Sign in with `admin` / `admin` — a password change is forced on first login.

> Run `php sifpress.php setup` from a shell as the user that owns the
> docroot: it writes `sifpress_config.php` as you (and chowns to the web user
> when run as root), which sidesteps a read-only document root.

### Deployment notes

- The artifact auto-generates `sifpress_config.php` on first request if it is
  missing, but CLI `setup` is the reliable path on locked-down hosts.
- Behind a reverse proxy, CDN or canonical host, set
  `define('SIFPRESS_BASE_URL', 'https://example.com/sifpress.php');` in
  `sifpress_config.php` — all generated links (admin, sifront, API, assets,
  sitemap) derive from it.
- `php sifpress.php status` prints paths, version and migration state.
  `php sifpress.php backup --dir=/srv/backups` snapshots and prunes
  (`php sifpress.php cron install` schedules it).

## Routing — the `?p=` protocol

| URL | What you get |
| --- | --- |
| `/sifpress.php` | the active sifront (public site) |
| `/sifpress.php?p=/article/hello-world` | sifront route `/article/hello-world` |
| `/sifpress.php?p=sifpress/admin` | admin UI (redirects to `?p=sifpress/admin/sifront`) |
| `/sifpress.php?p=sifpress/api&action=auth.login` | JSON API |
| `/sifpress.php?p=sifpress/migration&action=run` | apply migrations over HTTP |

Anything starting with `p=sifpress/` is handled server-side (`api`,
`migration`, `asset`, `update`, `seo`, `favicon`, `admin/…`); everything else
belongs to the active sifront. There are no `.htaccess` rules and no `#/`
hash routes — route changes go through `history.pushState`, so back/forward
work out of the box and every link is real.

## The front: sifronts

Sifronts are the public-facing SPAs under `sifronts/`. The default theme,
**sifpress1**, ships a glass design system, ambient canvas backgrounds, a
sidebar with pinned posts / tags / search, and KaTeX + syntax-highlighted
article rendering.

`php buildfront.php` packs a theme into `dist/<name>.sifront` — a ZIP with
exactly two entries: `meta.json` (identity, version and the `require_keys`
theme contract) and `bundle.js` (styles injected, fonts inlined). Upload it
from **Admin → Sifronts** (or `php sifpress.php update_sifront
dist/sifpress1.sifront --activate`); the backend stores it in the database and
serves it — it never opens a ZIP itself.

- **Customize without code:** the theme's identity lives in namespaced KV
  keys declared in `meta.json` (`sifpress1.sidebar.welcome`,
  `sifpress1.sidebar.links`, `sifpress1.background.kind`, …) — edit them from
  **Admin → KVs**; visitors read them guest-safe.
- **Customize with an agent:** the repo ships design skills in
  [`/.agents/skills/`](.agents/skills/) (`apple-design`,
  `my-glass-webui-design`) that your coding agent loads before touching the
  theme, so restyles stay faithful to the design system. Then
  `php buildfront.php` and upload.

## Local development

```bash
git clone https://github.com/liyu1981/sifpress.git
cd sifpress
pnpm install
php build.php           # dev artifact -> dist/index.php
./dev.sh                # http://localhost:5000, rebuilds on change
```

- Building needs PHP CLI, Node.js and pnpm — never on production.
- `php build.php release` → `dist/sifpress.php` (what Releases ship);
  `php buildfront.php [release]` → `dist/<name>.sifront` theme bundles.
  `./dev.sh` injects `sifpress1` into the DB after every rebuild.
- Layout: `src/` (PHP fragments), `migrations/*.sql`, `admin_ui/` + `ui_sdk/`
  (pnpm workspace), `sifronts/` (themes). Full conventions live in
  [AGENTS.md](AGENTS.md).
- **Cutting a release:** bump `APP_VERSION`, tag `vX.Y.Z`, push — GitHub
  Actions builds `sifpress.php` + `sifpress1.sifront`, publishes the release
  and updates `latest.json` for the in-app updater.

## Architecture

```text
                        Browser
                           │  one request (JS + CSS inlined)
                           ▼
                    ┌──────────────┐
                    │ sifpress.php │    one file, works at any path
                    └──────┬───────┘
              ┌────────────┴────────────┐
       p=sifpress/api             anything else
              │                          │
              ▼                          ▼
       PHP JSON API               React SPA
  auth · pages · assets ·     admin UI (?p=sifpress/admin)
  migration · update …        or the active sifront (?p=/…)
```

- Assembled from readable fragments in `src/` (env → bootstrap → db → auth →
  api → spa → router); `migrations/*.sql` are embedded at build time, detected
  as pending and applied one at a time in `BEGIN IMMEDIATE` transactions.
- SQLite + FTS5 in WAL mode at `<db-dir>/sys.db`; sessions are DB-backed with
  hashed tokens and HttpOnly cookies.
- The frontend is one pnpm workspace: `admin_ui` (admin app), `ui_sdk`
  (shared fetch / `?p=` rewrite / auth / markdown), `sifronts/*` (themes).

## Before production

Sifpress gives you sessions, RBAC and sane defaults, but the React bundle is
public and the API is yours:

- validate API input and use PDO prepared statements
- keep the forced admin password change; use strong session cookies (HttpOnly,
  `SameSite=Lax` — the defaults)
- configure a Content-Security-Policy (and CORS if the API is consumed
  elsewhere), disable `display_errors`, rate-limit sensitive endpoints
- never put secrets in frontend code

---

<p align="center">
  <a href="https://liyu1981.github.io/sifpress/">Website</a> ·
  <a href="https://github.com/liyu1981/sifpress/releases">Releases</a> ·
  <a href="https://github.com/liyu1981/sifpress">Source</a> ·
  <a href="AGENTS.md">Development guide</a>
</p>
