# Plan — clean-path URLs (`/sifpress/admin/assets`) + generated rewrite rules

Status: **shipped** — server, ui-sdk, CLI and docs are in; the only thing an
operator adds is the generated server config. Follows `plan/seo.md` (canonical
/ sitemap URLs come from the same helper) and `plan/asset-storage-plan.md`
phase 7 (a rule the *operator* must install, which the artifact can only
describe).

---

## 0. What ships

```bash
php sifpress.php rewrite apache          # → .htaccess snippet on stdout
php sifpress.php rewrite nginx           # → server{} snippet on stdout
php sifpress.php rewrite both --out=./   # writes .htaccess + sifpress-rewrite.conf
php sifpress.php rewrite check           # probes the live URLs, prints a verdict
php sifpress.php rewrite status          # mount path, mode, marker, next steps
php sifpress.php rewrite --forget        # back to ?p= links
```

With the rules installed:

| before | after |
|---|---|
| `/index.php?p=sifpress/admin/assets` | `/sifpress/admin/assets` |
| `/index.php?p=sifpress/admin/editor/42` | `/sifpress/admin/editor/42` |
| `/index.php?p=sifpress/api&action=pages.list` | `/sifpress/api?action=pages.list` |
| `/index.php?p=sifpress/asset&id=7` | `/sifpress/asset?id=7` |
| `/index.php?p=sifpress/asset/js/ui-sdk.mjs` | `/sifpress/asset/js/ui-sdk.mjs` |
| `/index.php?p=sifpress/sifront-bundle?id=2&v=1` | `/sifpress/sifront-bundle?id=2&v=1` |
| `/index.php?p=/article/hello-world` | `/article/hello-world` |
| `/index.php?p=sifpress/seo&action=robots` | `/robots.txt` |
| `/index.php?p=sifpress/seo&action=sitemap` | `/sitemap.xml` |

And **without** the rules everything keeps working exactly as today: `?p=` is
accepted on every route in both directions (old bookmarks, old emails, a
cached JS bundle, a `.sifront` archive built before the change). The mode is a
single config constant, deliberately: `SIFPRESS_PRETTY_URLS` in
`sifpress_config.php`, no settings row, no admin panel, no migration.

---

## 1. The key insight: the rewrite is a *copy*, and the router already speaks it

`src/router.php` dispatches on one parameter, `p`:

```php
$p = request_route();
if ($p === 'robots.txt') { handle_seo('robots', $method); }   // aliases
if (str_starts_with($p, 'sifpress/')) { /* module or admin route */ }
serve_sifront_page();                      /* everything else = the sifront */
```

So for **every** URL in the table, the mapping is the identity on the path:

```
/sifpress/admin/assets   →  index.php?p=sifpress/admin/assets
/article/hello-world     →  index.php?p=/article/hello-world
```

`p=/article/hello-world` already routes to the sifront (it does not start with
`sifpress/`), and `p=sifpress/admin/assets` already strips to the admin route
`/admin/assets`. **No new server protocol was needed.** The generated rules
are an accelerator of looks; the "rewrite-free artifact" promise in
`bootstrap.php` (`requires NO rewrite rules … routing is done entirely with
query parameters`) stays true.

Only `/robots.txt`, `/sitemap.xml` and `/favicon.ico` are genuine aliases
(path → module **plus** an action), handled as three lines in the generated
config plus three router aliases.

---

## 2. Design decisions (locked, as implemented)

1. **Copy the path into `?p=`, never parse it in PHP for the primary path.**
   One rule per server, no regex capture juggling, and `?p=` stays the
   canonical protocol.
2. **A PHP *fallback* derives the route from `REQUEST_URI`** when `p` is
   absent (`request_path()`, with `PATH_INFO` as a second source). It buys
   percent-encoding safety, hand-written server configs (Apache
   `FallbackResource`, Caddy, a proxy) and — because PHP's built-in server
   routes *every* URI to the artifact — clean-path routing in dev with no
   extra harness.
3. **PHP strips its own mount prefix** (`mount_path()` from `SCRIPT_NAME`, or
   `SCRIPT_FILENAME` minus `DOCUMENT_ROOT`), so the nginx snippet works
   verbatim at any depth (`/app/index.php?p=/app/article/x` → `/article/x`)
   with no regex or `map` in the server config.
4. **Detection is evidence-based, and configurable.** `SIFPRESS_PRETTY_URLS`:
   `'1'`/`'0'` force the mode; `'auto'` (default) turns it on only after a
   clean-path request has actually been observed, and remembers that in
   `<db_dir>/pretty_urls`. If the operator installs half the rules, the app
   does not start emitting 404-ing links.
5. **The frontend is told, it does not guess.** `base_url_meta()` injects
   `window.SIFPRESS_MOUNT` and `window.SIFPRESS_PRETTY_URLS` plus matching
   `<meta>` tags. A stale cached bundle ignores them and keeps emitting `?p=`,
   which keeps working.
6. **Relative URLs become mount-aware.** Today the API payload carries
   `?p=sifpress/asset&id=7` (document-relative, mount-proof). Pretty mode
   emits `<mount>/sifpress/asset?id=7` from the same helper.
7. **No migration, no settings row, no admin UI.** One config constant and one
   flag file. (A Settings card was considered and dropped: the rules belong to
   a shell, next to the web server config, and `rewrite check` gives a better
   verdict than a browser `fetch` could.)

---

## 3. URL map (the contract)

```
<s> = base origin           e.g. https://example.com
<m> = mount path            '' for /index.php, '/app' for /app/index.php
      (m is '' in the address bar, i.e. the URL never starts with '//')

<s><m>/                                     viewer sifront (root)        → p=
<s><m>/sifpress/admin[/route]              admin SPA shell              → p=sifpress/admin...
<s><m>/sifpress/api?action=…                JSON API                     → p=sifpress/api&action=…
<s><m>/sifpress/migration?action=…          migration status/run        → p=sifpress/migration&…
<s><m>/sifpress/asset?id=…[&thumb=1]        asset bytes (Range)          → p=sifpress/asset&…
<s><m>/sifpress/asset/js/<file>.mjs         ui-sdk chunk                → p=sifpress/asset/js/…
<s><m>/sifpress/sifront-bundle?id=…&v=…&h=… sifront bundle.js           → p=sifpress/sifront-bundle&…
<s><m>/sifpress/update?action=…             self-upgrade                → p=sifpress/update&…
<s><m>/sifpress/favicon                    icon (redirects to the asset) → p=sifpress/favicon
<s><m>/robots.txt   == <s><m>/sifpress/seo&action=robots              alias (router-side)
<s><m>/sitemap.xml  == <s><m>/sifpress/seo&action=sitemap             alias (router-side)
<s><m>/favicon.ico  == <s><m>/sifpress/favicon                        alias (router-side)
<s><m>/sifpress/dev?action=…                dev builds only              → p=sifpress/dev&…
<s><m>/<anything else>                     sifront route (SPA)          → p=/<anything else>
```

Reserved: a path segment `sifpress/…` at the mount root always means the
backend, never a sifront route — already true in `router.php`, and the
generated config keeps that order (specific rules first, catch-all last).

---

## 4. What landed

### Server — `src/urlmode.php` (new fragment, assembled right after `bootstrap.php`)

| function | role |
|---|---|
| `mount_path()` | `''` or `/app`, from `SCRIPT_NAME`, else `SCRIPT_FILENAME` − `DOCUMENT_ROOT` (the built-in server reports the *request* in `SCRIPT_NAME`) |
| `strip_mount_prefix()` | drop the mount from a path or a `p=` value |
| `normalize_route()` | percent-decode, collapse `.`/`..`/empty segments, strip control chars, cap 512 — the route can now come from a URL path, so it is a boundary, not cosmetics |
| `request_path()` / `request_route()` | `REQUEST_URI`/`PATH_INFO` path, else `?p=`; the artifact URL itself yields `''` |
| `request_is_pretty()` | this request arrived on a path — proof the rules are live |
| `pretty_urls_enabled()` | the `SIFPRESS_PRETTY_URLS` precedence (decision 4), memoised per request |
| `remember_pretty_urls()` / `forget_pretty_urls()` | the sticky marker in `db_dir()` |
| `route_path()` / `route_url()` | the only two places a URL is built from a route |

Call sites converted (no `?p=` literal is left in the PHP): `router.php`
(dispatch, the three aliases, the `/admin` redirect), `spa.php`
(`base_url_meta()` globals, `ui_sdk_src()` for the sifront shell + the
build-time script tags in the inlined admin HTML, favicon/apple links),
`seo.php` (`canonical_url()` → `route_url()`, robots disallows + the Sitemap
line in the right form), `asset.php`, `auth.php`, `api.php` (asset/avatar
payload URLs), `favicon.php` (redirect target), `cli.php`
(`SIFPRESS_PRETTY_URLS` in the config types).

### Client — ui-sdk

| file | change |
|---|---|
| `base-url.ts` | `mountPath()`, `prettyUrls()`, and `appBaseUrl()` returning the mount in pretty mode (the document may itself be `/article/foo`) |
| `api.ts` | new `moduleUrl(module, params)`; `apiUrl()`, `assetUrl()`, `avatarUrl()`, `assetSourceUrl()` all go through it |
| `lazy-chunks.ts` | `?p=sifpress/asset/js/<file>` → `moduleUrl()` |
| `rewrite.ts` | `input` accepts a bare path (strip mount, then module prefix; the artifact URL itself maps to `/`); `output` writes `mount + prefix + route`. Round-trips in all four mode × mount combinations |
| `markdown/video-source.ts` | the asset-URL detector matches both `?p=sifpress/asset` and `/sifpress/asset` |
| `admin_ui`, `sifpress1/2` | settings SEO links, favicon preview, sifront→admin links via `moduleUrl()` |

Router configs are untouched: the mode is read from the injected globals.

### CLI — `php sifpress.php rewrite …`

```
rewrite [apache|nginx|both|check|status] [options]
  --base-path=/app    URL path the artifact is mounted at. Default, in order:
                      --base-path → SIFPRESS_PRETTY_BASE (env) → path of
                      SIFPRESS_BASE_URL → path of the site_url setting → '/'
  --out=FILE|DIR      write instead of printing (apache → .htaccess,
                      nginx → sifpress-rewrite.conf)
  --forget            delete the sticky <db_dir>/pretty_urls marker
  --set-config        pin SIFPRESS_PRETTY_URLS=1 in sifpress_config.php
  --base-url=URL      override the probe base for `check`
  --config=PATH
```

`rewrite status` prints the artifact path, mount, base URL, the constant, the
marker path and the mode the artifact is in right now, plus the two commands
to run next. `rewrite check` probes four URLs (`/sifpress/api?action=…`,
`/sifpress/admin/login`, `/robots.txt`, an unroutable path) with a 5 s timeout
and no redirect following; a 404 is the "the web server did not route this path
to the artifact" signal, which is why no app-side marker header is needed.

### Apache 2 (`.htaccess`, per-directory, correct at any mount depth)

```apache
# Sifpress — clean-path URLs (generated by `php sifpress.php rewrite apache`).
<IfModule mod_rewrite.c>
    RewriteEngine On

    RewriteCond %{REQUEST_FILENAME} -f [OR]
    RewriteCond %{REQUEST_FILENAME} -d
    RewriteRule ^ - [L]

    RewriteRule ^robots\.txt$  index.php?p=sifpress/seo&action=robots  [QSA,L]
    RewriteRule ^sitemap\.xml$ index.php?p=sifpress/seo&action=sitemap [QSA,L]
    RewriteRule ^favicon\.ico$ index.php?p=sifpress/favicon             [QSA,L]

    RewriteRule ^(.*)$ index.php?p=/$1 [QSA,L]
</IfModule>
```

No `RewriteBase` is needed (the substitution is relative to the directory,
which is what makes it mount-independent). `QSA` preserves `?inspect=1` and
`?action=…`; if the visitor already passed a `p=`, the original wins in
`$_GET`, which is the correct precedence. The generator also prints the
Apache 2.4.8+ alternative with no `mod_rewrite` at all —
`FallbackResource /index.php` — which works through decision 2.

### nginx

Root mount (paste inside `server {}`; if the vhost already has
`location / { try_files … ; fastcgi_pass …; }`, replace only the try_files
line):

```nginx
location = /robots.txt  { rewrite ^ /index.php?p=sifpress/seo&action=robots  last; }
location = /sitemap.xml { rewrite ^ /index.php?p=sifpress/seo&action=sitemap last; }
location = /favicon.ico { rewrite ^ /index.php?p=sifpress/favicon             last; }

location / {
    try_files $uri $uri/ /index.php?p=$uri;
}
```

`--base-path=/app`:

```nginx
location = /app { return 301 /app/; }
location = /app/robots.txt  { rewrite ^ /app/index.php?p=sifpress/seo&action=robots  last; }
location = /app/sitemap.xml { rewrite ^ /app/index.php?p=sifpress/seo&action=sitemap last; }
location = /app/favicon.ico { rewrite ^ /app/index.php?p=sifpress/favicon             last; }

location /app/ {
    # $uri keeps the /app prefix inside ?p=; the artifact strips its own
    # mount prefix, so no map or capture is needed here.
    try_files $uri $uri/ /app/index.php?p=$uri;
}
```

Two caveats the generator prints with the snippet: the PHP handler must stay a
`location ~ \.php$` block (a `^~` prefix location would swallow it and serve
`.php` as static), and no competing `try_files $uri =404;` may live in that
block.

---

## 5. Verified (curl + typecheck; no browser, per repo rules)

```bash
php build.php && php buildfront.php
php dist/index.php rewrite both            # text sane, both mount variants
php dist/index.php rewrite status           # mount/mode/marker report
php dist/index.php rewrite check --base-url=http://127.0.0.1:5099   # 4/4 OK
```

- **Both spellings, one artifact** — `/sifpress/api?action=system.status`,
  `/sifpress/admin/assets`, `/article/hello`, `/index.php?p=…` (same routes),
  `/robots.txt` (`text/plain`), `/sitemap.xml` (`application/xml`),
  `/favicon.ico` (302 → asset), asset serving incl. `206` ranges.
- **Sub-directory mount** (`/tmp/docroot/app/index.php`): `mount_path()` =
  `/app`, `/app/sifpress/admin/assets` resolves, meta reports
  `sifpress-mount=/app`, links/robots/sitemap all carry the prefix.
- **All four modes**: query-only → `?p=` links; clean-path request → pretty
  links + marker written; later `?p=` request → sticky pretty; forced `0` →
  `?p=` links again while clean paths keep resolving.
- **ui-sdk**, run under Node with a stubbed `window`: `output → input` round
  trip returns the same internal route in every mode × mount combination, and
  `moduleUrl`/`assetUrl` produce `/sifpress/api?action=…` /
  `/app/sifpress/asset?id=7` in pretty mode.
- `pnpm run typecheck` + `pnpm run format` clean in `ui_sdk`, `admin_ui`,
  `sifpress1`, `sifpress2`.

The generated Apache/nginx text itself can only be proven on a real server;
`rewrite check` is the operator-side check for that.

---

## 6. Risks and rollback

| risk | mitigation |
|---|---|
| Rules installed, bundle stale (old JS emits `?p=`) | both forms accepted by the router, forever |
| `SIFPRESS_PRETTY_URLS=1` forced but no rules → admin links 404 | force is opt-in and documented as such; `auto` (default) is evidence-based; `rewrite --forget` + config edit is the rollback |
| nginx `location /` swallows a co-hosted app | sub-directory form generated with `--base-path`; the root form carries an explicit warning comment |
| path-derived route widens the input surface | `normalize_route()` collapses `..`/control chars/caps length; `serve_ui_sdk()` already whitelists by `basename()` |
| `SCRIPT_NAME` oddity breaks `mount_path()` | two derivations, conservative fallback to `''`; a wrong mount only affects prefix normalisation, never resolution |
| stale `<link rel=canonical>` after enabling pretty | canonical switches in the same release as the rules; `/sitemap.xml` and `/robots.txt` aliases keep crawlers on the new URLs |
| `db_dir` read-only | the marker write is `@`-silenced; auto mode re-observes the next clean-path request |
| dev box flips to pretty (the built-in server routes everything) | harmless — the dev server resolves the paths; `php dist/index.php rewrite --forget` resets |

Rollback is one command (`rewrite --forget`) plus removing the server config.
No DB change, and no rebuild needed for the rollback path.

---

## 7. Left / deliberately out of scope

- **Other servers** (Caddy, IIS, LiteSpeed). The `REQUEST_URI` fallback makes
  them work; only Apache/nginx generators ship.
- **Trailing-slash policy** and slug-prefix clean URLs (`/2026/09/post`): the
  copy mapping has no notion of a slug prefix, so the route tree stays the
  source of truth.
- **CDN cache keys**: enabling pretty URLs changes every generated URL string,
  so purge rules have to be revisited (as with any URL migration).
- **Bundled sifronts stay on `?p=`** until rebuilt against the new ui-sdk —
  which is a no-op in practice, since both forms are accepted.
- **Phase 5 (Settings card) was cut.** A config constant plus `rewrite check`
  covers the operator; an admin panel would only duplicate the generator and
  guess at the server type from a header.
