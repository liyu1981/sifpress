# Plan — SEO (site settings + per-page metadata)

Sifpress is a single-file PHP artifact serving a client-rendered React SPA. Today
the only crawlable signal is what `serve_spa()` injects: a route-key `<title>`
(`Sifpress — Article`), a matching description, and `app-route`/`app-version`
tags. Real search engines need page-specific titles, descriptions, Open Graph /
Twitter cards, canonical URLs, and crawl directives — plus a sitemap and
`robots.txt`. This plan adds:

1. **Site-level SEO settings** — a DB-backed key/value store, editable from a new
   Settings tab, feeding server-side head injection.
2. **Per-page SEO fields** — `seo_title`, `description`, `keywords`, `og_image`,
   `canonical`, `noindex` stored in the page's YAML front matter (extending the
   existing `cover` extra-field mechanism) with a dedicated editor UI.
3. **Server-side meta injection** — `serve_spa()` emits rich `<head>` tags
   (title, description, OG, Twitter, canonical, robots, JSON-LD) for article
   routes, resolved from the DB.
4. **`sitemap.xml` + `robots.txt`** — served by a new `?module=seo` handler.
5. **Client-side head sync** — a `usePageMeta` hook so SPA navigation (no page
   reload) keeps `<title>`, meta, OG, and canonical correct.

---

## 1. Design decisions (locked)

- **Settings live in the DB**, not localStorage. They must be readable by
  `serve_spa()` (server-side) for head injection and by the client for SPA
  navigation, so a `settings` key/value table is required (new migration).
- **`settings.get` is public; `settings.update` requires a new `settings.manage`
  permission** (seeded to admin only). The settings table holds no secrets
  (branding/SEO config goes into the public `<head>` anyway), so exposing reads
  is harmless and lets anonymous visitors sync client-side meta after JS runs.
- **Per-page SEO lives in front matter** (consistent with `title`/`slug`/`tags`/
  `cover`). Keys are reserved so the generic extra-fields UI can't duplicate
  them; the editor gets a dedicated "SEO" section.
- **Server-side injection covers published, guest-visible articles only.**
  Drafts/private pages get `noindex` + a generic title (never page content), so
  a draft slug can't leak meta. Reuse `can_view_page(null, $page)` (anonymous =
  guest context).
- **`site_url` setting is the canonical base.** When empty, it's derived from
  `$_SERVER` (scheme + host + script name) so the rewrite-free artifact works at
  any mount depth. Canonical for `/article/x` = `<base>?u=article/x`.
- **Sitemap/robots are a new `?module=seo` handler**, mirroring the
  `?module=update` / `?module=migration` pattern (they're XML/text, not JSON, so
  they don't belong in the API dispatch). `application/xml` / `text/plain` with
  `no-cache` headers.
- **Title suffix from `site_name`** (`{seo_title|title}{suffix}`), suffix
  defaulting to ` — {site_name}`; empty suffix = bare title.
- **Description fallback chain**: front-matter `description` → auto-excerpt from
  the markdown body (strip syntax, ~155 chars) → site `site_description`.
- **OG image fallback chain**: front-matter `og_image` → `cover` → site
  `default_og_image`. Twitter `summary_large_image` mirrors it.
- **Migration-pending guard**: `serve_spa()` must not touch the DB for meta when
  `db_needs_migration()` (schema may not exist yet) — it already guards the
  maintenance tag; SEO injection sits behind the same check.

## 2. Settings contract

Migration `migrations/0009_seo_settings.sql`:

```sql
CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

Keys (all optional; empty = app default):

| key                   | default            | used for                                            |
|-----------------------|--------------------|-----------------------------------------------------|
| `site_name`           | `APP_NAME`         | `<title>` suffix, `og:site_name`, sitemap `<loc>`   |
| `site_description`    | `''`               | fallback `<meta description>`                       |
| `site_url`            | derived from server| canonical base, sitemap/robots absolute URLs        |
| `default_og_image`    | `''`               | OG/Twitter image fallback                           |
| `twitter_handle`      | `''`               | `twitter:site` (`@handle`)                          |
| `enable_sitemap`      | `'1'`              | toggle `?module=seo&action=sitemap` + robots Sitemap line |
| `robots_content`      | `''`               | custom `robots.txt` body (empty = built-in default) |

## 3. Backend

### 3.1 New fragment `src/seo.php` (wired into `build.php` after `asset.php`,
before `spa.php`, both modes)

Helpers:

- `setting_get(string $key, ?string $default = null): ?string` — cached per
  request (`static`). `setting_set(string $key, string $value): void` — upsert
  with `updated_at = datetime('now')`.
- `front_matter_value(string $content, string $key): ?string` — scalar read of a
  single front-matter key (mirrors `front_matter_tags()`'s regex approach;
  skips array/inline-list values). Reused by `page_payload` and injection.
- `excerpt_from_markdown(string $md, int $len = 155): string` — strip
  front matter, code fences, image/heading syntax, and inline markdown to a
  plain-text teaser (~155 chars).
- `canonical_url(string $route): string` — `<base>` from `site_url` or
  `$_SERVER`, `?u=` for non-root routes.
- `page_seo(array $page): array` — the resolved SEO payload for a page
  (title/description/og_image/canonical/noindex), applying the fallback chains
  in §1.
- `seo_meta_tags(string $route): string` — builds the `<head>` block (returns
  `''` when migration-pending). Route logic:
  - `/article/<slug>` (regex `#^/article/([a-z0-9]+(?:-[a-z0-9]+)*)$#`): fetch
    by slug; only if `status='published'` **and** `can_view_page(null, $page)`
    emit full meta; otherwise `robots noindex` + site-default title. The
    `DEMO_PAGE_SLUG` virtual page also gets article meta via `demo_page_payload()`.
  - `/`, `/article`, unknown: site-name title + site description, `noindex` only
    on private routes (`/editor…`, `/settings`, `/assets`, `/login`).
  - Emitted tags: `<title>`, `<meta name="description">`,
    `<meta name="robots">` (only when noindex or a custom directive is set),
    `<link rel="canonical">`, `og:title/og:description/og:type/og:url/og:image/
    og:site_name`, `twitter:card/title/description/image/site`, and JSON-LD
    `<script type="application/ld+json">` (Article schema: headline, description,
    datePublished, dateModified, author, image, url, mainEntityOfPage).
- `handle_seo(string $action, string $method): never`:
  - `action=sitemap` (GET): `Content-Type: application/xml`, `no-cache`. When
    `enable_sitemap != '1'` → 404. URLset: `<base>` + every published,
    guest-visible page (`can_view_page(null, …)`) as
    `<url><loc>{canonical}</loc><lastmod>{updated_at date}</lastmod></url>`.
  - `action=robots` (GET): `Content-Type: text/plain`, `no-cache`. Body =
    `robots_content` when non-empty, else the built-in default
    (`User-agent: *`, `Allow: /`, `Disallow: /?u=editor`, `Disallow: /?u=settings`,
    `Disallow: /?u=login`); append `Sitemap: <base>?module=seo&action=sitemap`
    when sitemap is enabled and not already present.
  - unknown action → 404.

### 3.2 `src/spa.php` — richer injection

In `serve_spa()`: keep the `app-route`/`app-version`/`app-maintenance` tags and
the last-`</head>` insertion. Replace the current route-key block with:

```php
if (db_needs_migration()) {
    $meta .= '<meta name="app-maintenance" content="1">';
} else {
    $meta .= seo_meta_tags($route);   // '' on missing DB / non-SEO routes
}
```

Fall back to site settings for the default `<title>` when `seo_meta_tags`
returns an empty string.

### 3.3 `src/api.php` — settings actions + payload

- `api_settings_get(string $method): never` — GET; returns
  `{ settings: { site_name, site_description, site_url, default_og_image,
  twitter_handle, enable_sitemap, robots_content } }`. Public (added to
  `$public` in `handle_api`).
- `api_settings_update(string $method): never` — PATCH;
  `require_permission('settings.manage')`; validates lengths
  (`site_name` ≤ 100, `site_description` ≤ 200, `site_url` ≤ 300 & valid URL or
  empty, `default_og_image` ≤ 300 & valid URL or empty, `twitter_handle` ≤ 32 &
  `/^@?[A-Za-z0-9_]{1,15}$/`, `enable_sitemap` in `{'0','1'}`, `robots_content`
  ≤ 2000). Partial update of present keys only; returns `{ ok: true }`.
- Wire both into the `handle_api` switch + the `actions` index list.
- `seed_rbac()`: add `'settings.manage'` to `$permissions` in `src/db.php`
  (admin links to all current permissions on the next seed run, so no role
  changes needed for editors/viewers).
- `page_payload()`: add `'seo' => page_seo($page)` so the client gets resolved
  SEO data without re-deriving it (still cheap; client can ignore and compute
  from `content_md` if preferred).

### 3.4 `src/router.php` + `build.php`

```php
if ($module === 'seo') {
    handle_seo((string) request_param('action', 'robots'), $method);
}
```

`build.php`: add `'seo.php'` to `$parts` between `asset.php` and `spa.php`;
update the header doc.

## 4. Frontend

### 4.1 API lib — `frontend/src/lib/pages.ts`

```ts
export interface SeoSettings {
  site_name: string;
  site_description: string;
  site_url: string;
  default_og_image: string;
  twitter_handle: string;
  enable_sitemap: '0' | '1';
  robots_content: string;
}
export const settingsApi = {
  get: () => apiRequest<{ settings: SeoSettings }>('settings.get').then(r => r.settings),
  update: (input: Partial<SeoSettings>) =>
    apiRequest<{ ok: true }>('settings.update', { method: 'PATCH', body: input }),
};
```

### 4.2 `frontend/src/lib/front-matter.ts` — reserved SEO keys

Add `SEO_FRONT_MATTER_KEYS = ['seo_title','description','keywords','og_image','canonical','noindex']`;
extend `STANDARD_FRONT_MATTER_KEYS` filter so these are excluded from the
generic extra-fields list. Extend `BuildFrontMatterInput` with an optional `seo`
object and emit the keys (sorted, after the standard block) — `noindex` written
as `true`/`false` (`formatExtraValue` already handles booleans). Extend
`parseFrontMatter` consumers to read them via `frontMatterString`/`frontMatterBool`.

### 4.3 `frontend/src/hooks/use-page-meta.ts`

`usePageMeta({ title, description, image, canonical, noindex, type })` — an
upsert-sync of `<head>` on effect: `document.title`, `meta[name=description]`,
`meta[property=og:*]`, `meta[name=twitter:*]`, `link[rel=canonical]`,
`meta[name=robots]`. Replaces `usePageTitle` usage on the pages below (keeps
`usePageTitle` for the admin-only pages).

### 4.4 Settings → new SEO tab

- `SettingsPage`: new `TabsTrigger value="seo"` shown when
  `has('settings.manage')`; `SeoSettingsCard` in the corresponding
  `TabsContent` (same Card/glass styling as `SystemSettingsCard`).
- Fields: site name, site description (textarea), site URL, default OG image,
  Twitter handle, sitemap toggle (`Switch`), custom robots.txt (textarea).
- Load via `settingsApi.get` (TanStack Query, `queryKey: ['seo-settings']`);
  save via `settingsApi.update` mutation + success toast; validation errors from
  the API rendered inline (reuse the `ApiError` pattern from `ProfileCard`).
- A "View sitemap / robots" helper row linking to
  `?module=seo&action=sitemap` and `...&action=robots`.

### 4.5 Editor — SEO section

In the `frontTab === 'fields'` panel, under the tags row, add a collapsible
"SEO" section (same pattern as the extra-fields toggle):

- `seo_title` (optional `<title>` override), `description` (textarea with
  live char count vs the ~155-char target), `keywords` (comma-separated),
  `og_image` (URL; hint that `cover` is the fallback), `canonical` (optional
  absolute override), `noindex` (`Switch`).
- Load: map these keys out of `meta.data` alongside `cover` in the existing
  `useEffect`/`applyRawFront` init; the keys are excluded from `extraFields`.
- Save: folded into `buildFrontMatterFromFields()` via the new `seo` input; the
  raw tab keeps working (they're ordinary YAML keys).
- Also expose them through the agent bridge (`EditorFrontMatter` gains an `seo`
  object) so the in-editor agent can set them without extra work.

### 4.6 Article pages — client head sync

- `article-detail.tsx`: replace `usePageTitle(page.title)` with
  `usePageMeta(article.data?.seo ?? fallback)` — title, description, og image,
  canonical, noindex, `type: 'article'`.
- `home.tsx` / `article-index.tsx`: use site defaults
  (`settingsApi.get` via a small shared query key) for title/description.
- `router.tsx` `RootLayout`: set a baseline `usePageMeta` (site name +
  description) so every client-side navigation has correct meta even while page
  queries are loading.

### 4.7 i18n

Add `seo.*` keys to `frontend/src/lib/i18n.ts` in both `en` and `zh`: settings
tab label, field labels/hints (site name, description, URL, default OG image,
twitter handle, sitemap, robots), sitemap/robots links, editor SEO section
labels (SEO title, description + char count, keywords, og image, canonical,
noindex), and `settings.manage`-missing copy if the tab is ever shown without
permission.

## 5. Edge cases & risks

- **Migration-pending**: `seo_meta_tags` returns `''` behind the
  `db_needs_migration()` guard; `?module=seo` returns 503 like `update`.
- **Drafts / private pages**: never get content meta; `robots noindex` keeps
  them out of indexes. Sitemap lists only published + guest-visible rows.
- **Virtual demo page** (`DEMO_PAGE_SLUG`): gets article meta from
  `demo_page_payload()` when no real page owns the slug (and a real published
  page with that slug takes precedence).
- **`site_url` misconfigured / non-HTTP context** (CLI, `php -S` without host):
  fall back to `$_SERVER` derivation; if that yields nothing usable, emit
  relative canonical/omit it rather than crashing.
- **XSS / header hygiene**: every injected value is `htmlspecialchars(...,
  ENT_QUOTES | ENT_HTML5)` exactly as `serve_spa()` does today. `robots_content`
  is served as plain text (never parsed as markup) and length-capped.
- **Client/server drift**: the client `usePageMeta` re-derives from
  `page.seo`/settings on every navigation, so SPA route changes and server
  injection agree.
- **Self-XSS in meta** (`site_name` with `"`, etc.): handled by escaping on
  injection; `robots_content` escaping is N/A (plain text body).
- **Performance**: settings are read once per request (static cache); sitemap
  does one indexed scan of published pages — negligible for the expected scale.

## 6. Implementation checklist

1. `migrations/0009_seo_settings.sql` — `settings` table.
2. New `src/seo.php` — helpers (§3.1) + `handle_seo`; build.php `$parts` order;
   router dispatch.
3. `src/db.php` — add `settings.manage` to `seed_rbac()` permissions.
4. `src/api.php` — `settings.get` / `settings.update` actions, dispatch, public
   list, `page_payload` `seo` field.
5. `src/spa.php` — swap route-key injection for `seo_meta_tags($route)`.
6. Rebuild + curl: `?u=article/<slug>` head tags (title/OG/canonical/JSON-LD),
   `?u=article/draft-slug` (noindex), `?module=seo&action=sitemap`,
   `&action=robots`, `settings.get/update` (auth + RBAC 403 for viewer).
7. Frontend: `settingsApi` in `pages.ts`; `SEO_FRONT_MATTER_KEYS` +
   `buildFrontMatter` seo input; `usePageMeta` hook; SEO settings tab; editor
   SEO section; article/home/index/RootLayout wiring; agent bridge `seo`.
8. `pnpm run format` + `pnpm run typecheck` + `php build.php release` all pass.
9. README: document `?module=seo` endpoints, `site_url`, and the reserved
   front-matter SEO keys.