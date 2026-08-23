# Plan — sifpress1 theme config via the KV store

sifpress1 is the default public-facing sifront. Today most of its "site identity"
data — the welcome heading, social icons, shortcut links, footer, ambient palette,
and UI copy — is hardcoded in its React components. The backend already ships a
general-purpose key-value API (`kvs.*`, values are JSON, guest-readable when a
pair carries a `_guest_` view grant). This plan moves the theme's dynamic data
into namespaced KV keys so a site owner can customize the theme from the admin
KVs page without touching code — e.g. `{Welcome, I am sifpress}` becomes the
value of `sifpress1.sidebar.welcome`.

Non-goals: articles/tags/assets stay on their entity APIs; nothing here changes
the KV API itself.

---

## 1. Backend facts (verified)

- Endpoints live in `src/api.php` dispatch (`kvs.list/get/create/update/delete/
  grants/grant/revokeGrant`). Values are JSON up to 1 MB (`KV_MAX_VALUE_BYTES`),
  keys ≤ 200 chars.
- **Public visibility model**: a pair is public iff it has a `view` grant for the
  `_guest_` user (`kv_is_public()`); `kvs.create` auto-grants guest-view by
  default (`kv_grant_default_guest_view()`), so theme keys created through the
  normal flow are readable by anonymous sifront visitors with plain `kvs.get`.
  No auth, no backend change needed for reads.
- Keys are free-form strings (≤ 200 chars, any characters) — see §2 for why the
  theme uses an explicit batch-read endpoint instead of listing by prefix.
- `ui-sdk` already exposes `kvsApi` (`ui_sdk/src/pages.ts`); the admin UI already
  has a KVs management page
  (`admin_ui/src/pages/kvs.tsx`) with JSON value editing, public toggle, and
  grants — site owners can author these keys today.

## 2. Batch KV read API (`kvs.batchGet`)

The one new backend piece. A generic best-effort multi-key read so any consumer
(sifront themes, admin UI) can hydrate a known set of keys in a single request.

**Contract**

- `POST ?p=sifpress/api&action=kvs.batchGet`, JSON body:
  `{"keys": ["sifpress1.sidebar.welcome", "sifpress1.footer.copyright"]}`
- Response (exactly found-vs-missing, no other distinction):
  ```json
  {
    "data": { "sifpress1.sidebar.welcome": { "text": "Welcome, I am sifpress" } },
    "not_found": ["sifpress1.footer.copyright"]
  }
  ```
- `data[key]` is the decoded `value_json` (the value only — consumers wanting
  metadata use the existing `kvs.get` / `kvs.list`).

**Semantics and guardrails**

- **POST, not GET**: keys are free-form strings that may contain `,`, `&`, `=`,
  `[`, `]`… which makes query-string encodings (`keys[]=`, comma-joined)
  ambiguous or escaping-hairy; POST + JSON body is unambiguous and has no URL
  length ceiling. It also drops into `moduleRequest({ body })` with zero
  ui-sdk plumbing changes.
- **Best effort, never 404**: missing keys are reported in `not_found`; the
  request itself succeeds (200).
- **No existence leak**: rows are fetched with one `WHERE key IN (...)`, then
  each row passes through the existing `kv_can_view(current_user(), $row)`.
  Rows the caller may not view land in `not_found` — indistinguishable from
  absent. No new permission gate; visibility mirrors `kvs.get`.
- **Input hygiene**: trim entries, drop empties, dedupe; reject non-array /
  non-string entries with 422. Cap at `KV_BATCH_MAX_KEYS = 100` (422 over cap).
  Empty list ⇒ `{data: {}, not_found: []}`.

**Client**: extend `kvsApi` with `getMany(keys: string[])` returning
`{ data: Record<string, unknown>; not_found: string[] }`.

## 3. Design decisions (theme side)

- **Key namespace `sifpress1.`** — owned by this theme, versioned by name. Other
  sifronts get their own namespace later (`<name>.*`).
- **Granular keys**, not one config blob: matches the `sifpress1.sidebar.welcome`
  model and keeps each editable field small; the batch endpoint makes granular
  keys cheap (one request regardless of key count).
- **In-code defaults + graceful degradation**: every consumed key falls back to
  today's hardcoded value when absent (or not guest-visible). An empty DB renders
  exactly the current site; no migration or seeding is required for correctness.
- **One fetch in RootLayout**: a `useThemeConfig()` hook calls
  `kvsApi.getMany(THEME_KEYS)` once (react-query, staleTime 60s like existing
  queries), validates/clamps shapes, merges over defaults, and shares the typed
  config via context. Components stop fetching SEO settings for identity display.
- **Social icons use a built-in name set** (`instagram`, `linkedin`, `github`,
  `facebook`, `x`, `email`, …) resolved to bundled SVG paths — users must not
  hand-edit SVG path data. Unknown names fall back to a generic link icon;
  unknown shapes are skipped defensively (values are user-authored JSON).
- **Copy overrides are a flat map** under `sifpress1.copy.*` consumed through a
  tiny lookup helper, not per-key context plumbing.

## 4. Key contract

| Key | Type / shape | Feeds | Default (= current hardcoded) |
|-----|--------------|-------|-------------------------------|
| `sifpress1.sidebar.welcome` | string | Sidebar heading (sidebar.tsx) | `"Welcome, I am {site_name}"` (SEO fallback preserved) |
| `sifpress1.sidebar.about` | string | Sidebar description line | SEO `site_description` |
| `sifpress1.sidebar.avatar` | string (URL/asset URL) | Avatar image; empty ⇒ letter initial | initial of welcome/site name |
| `sifpress1.sidebar.socials` | `Array<{label, href, icon?, color?}>` | Social icon row | current SOCIALS array |
| `sifpress1.sidebar.links` | `Array<{label, href}>` | Links & Shortcuts | current LINKS array |
| `sifpress1.footer.text` | string | Footer left text | `"Powered by Sifpress · GitHub"` |
| `sifpress1.footer.copyright` | string | Footer right text | `"© {year}"` |
| `sifpress1.copy.*` (phase 2) | flat string map | UI copy: empty states, search results header, article-not-found, 404 text, "Continue reading →", "min read", "Uncategorized" | current strings |
| `sifpress1.ambient.palette` (phase 3) | `{light:{sat,light,alpha,count,hues[]}, dark:{...}}` | Ambient background blobs | current HUES/LIGHT/DARK constants |

## 5. Implementation phases

### Phase 0 — backend + sdk (this change)

1. `src/api.php`: `KV_BATCH_MAX_KEYS` const, `api_kvs_batch_get()` (per §2),
   dispatch case `kvs.batchGet`.
2. `ui_sdk/src/pages.ts`: `kvsApi.getMany(keys)` typed wrapper.

### Phase 1 — core identity

1. New module in `sifronts/sifpress1/src/lib/theme-config.tsx`: provider +
   `useThemeConfig()`. One `kvsApi.getMany(THEME_KEYS)`, validates/clamps
   shapes, merges over defaults, exposes typed config.
2. Wire `RootLayout` to wrap children in the provider; sidebar consumes config
   for welcome/about/avatar/socials/links (icon-name → path lookup table added).
3. Footer consumes `footer.text` / `footer.copyright`.
4. Keep `document.title` on SEO settings; fall back to welcome name instead of
   `'Sifpress'` when SEO is empty.
5. Remove the now-unneeded `settingsApi.get` dependency from the Sidebar props
   path (settings query stays in RootLayout only for `<title>`).

### Phase 2 — copy overrides

- Add `sifpress1.copy.*` lookups (helper `tc(key, fallback)`); swap the literal
  strings listed in §4. Purely mechanical after Phase 1's hook exists.

### Phase 3 — visuals (optional)

- Ambient background reads `ambient.palette` with numeric clamping identical to
  the current `clamp()` bounds; missing/invalid fields keep stock palette.

### Docs / authoring

- Document the key schema in this file plus a short section in `README.md`
  (or a new `docs/` note): how to create/edit keys from Admin → KVs, and that
  newly created pairs are public by default (toggleable per pair).

## 6. Verification

- `pnpm run typecheck`, `php build.php`, and `php buildfront.php` build clean.
- Backend curl matrix against `./dev.sh` (`kvs.batchGet`):
  - mixed existing/missing keys anonymous ⇒ 200, found keys in `data`,
    missing in `not_found`;
  - pair with `_guest_` grant revoked ⇒ key reported in `not_found`
    (indistinguishable from absent);
  - >100 keys / non-array body / non-string entries ⇒ 422;
  - duplicate + empty entries ⇒ deduped/dropped, single row fetched.
- Theme behavior:
  - no keys present ⇒ rendered output identical to today (defaults);
  - revoked guest grant ⇒ theme silently falls back to default;
  - malformed value shapes (wrong types, extra fields) ⇒ ignored, defaults used.
- Biome format pass over touched TS/TSX (`pnpm run format`).

## 7. Open questions (resolve before coding)

1. Seed example `sifpress1.*` keys in a migration vs. rely on in-code defaults
   only? (Lean: defaults only; seeding adds migration surface for no behavior.)
2. Avatar as plain URL string vs. asset id resolved through `assetUrl`?
   (Lean: plain URL — owners can paste an asset URL copied from the assets page.)
