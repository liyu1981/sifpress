# sifront-article-preview-plan.md — preview an article in the live sifront

> Status: **implemented** — Phase 1 + Phase 2b, plus the server-side
> `noindex` for non-public article shells (`article_noindex_meta()` in
> `src/seo.php`, appended by `serve_sifront_page()`). Deferred: 2a
> save-then-preview, 2c shareable tokens, Phase 3.
> Related: `plan/pretty-urls-rewrite.md` (URL modes), `ui_sdk/src/inspect.tsx`
> (`withInspect` + the `createQueryRewrite` keep-list), AGENTS.md → "KV inspect
> mode" and the sifpress2 copy-key rules.

Scope: an admin-side **Preview** action that opens an article exactly as the
public sifront renders it — including a draft and, later, unsaved editor
buffer content — with an unmistakable "this is not live" marker inside the
sifront. It closes the loop with the **Edit this page** link both sifronts
already show (`adminEditorUrl()`), which today has no reverse direction.

---

## 1. UX

1. **Editor header**, next to Save: an **Eye** button, *Preview*, opens
   `/article/<slug>` in a new tab (`target="_blank" rel="noopener noreferrer"`,
   same as the Preview button on the sifront admin page). Disabled (with a
   "save first" hint) while the article has never been saved — `/admin/editor/new`
   has no slug, so there is nothing to open.
2. **Article list row** and **admin article detail** get the same action
   ("View live" for a published page, "Preview" for a draft).
3. In the sifront, a draft renders with a compact strip: **"Draft — preview
   only, this article is not published"** plus a link back to the editor.
   A published page previews without the strip — it *is* the live page.
4. Nothing changes for everyone else: a guest or a viewer opening the same URL
   still gets the existing "Article Not Found … doesn't exist or isn't
   published" screen (server-side, see §2).
5. Round trip: sifront `Edit this page` ⇄ admin `Preview`.

---

## 2. What already exists (verified in code)

| Piece | Where | State |
| --- | --- | --- |
| Draft gate | `api_pages_get()` (`src/api.php`): `status === 'draft'` → 404 unless `can_view_page()` **and** `can_edit_page()` | ✓ no new endpoint needed for saved drafts |
| Payload carries the state | `page_payload()` → `status`, `hide_from_search`, `can_edit`, `seo`; ui_sdk `Page.status` | ✓ |
| Cookies reach the sifront fetch | `pagesApi.get({ slug })` → `fetch` with the default `credentials: 'same-origin'` | ✓ an editor already sees a draft by typing the URL |
| Server-rendered head for the article route | `seo_meta_tags()` (`src/seo.php`) — **admin shell only** (`serve_spa()`); sifront shells carried no SEO meta at all | ✗ found during implementation → `article_noindex_meta()` now appended by `serve_sifront_page()` for every sifront (draft / ungranted / unknown slug → `noindex,nofollow`) |
| Nothing cacheable | `serve_sifront_page()` → `Cache-Control: no-cache`; `json_response()` → `no-store` | ✓ |
| Public surfaces stay public | sifront home calls `pagesApi.list({ status: 'published' })`; `api_status_param()` downgrades a draft listing for non-writers; sitemap/search likewise | ✓ assert, don't change |
| Sifront → admin link | `adminEditorUrl()` in both `article.$slug.tsx` | ✓ the missing half is admin → sifront |
| URL building | `ui_sdk` `moduleUrl()` / `appBaseUrl()` / `mountPath()` / `prettyUrls()` | ✗ `moduleUrl()` only builds **`sifpress/*` module** paths — there is no builder for root-mounted sifront routes (`/article/x`), and the admin must emit the active URL mode (§3.1) |
| External-link precedent | `admin_ui/src/pages/sifront.tsx` (`Eye`, `_blank noopener`) | ✓ copy the pattern |
| Param keep-list | `createQueryRewrite(undefined, '', ['inspect'])` in both sifront routers | ✓ the mechanism to copy if a `?preview` param is added |

Gaps this plan fills: no admin entry point; no draft marker in the sifront;
`useArticle()` in sifpress2 maps through `lib/stories.ts` and **drops `status`**
(`ArticlePage extends Story`), so that route cannot even see the state today;
no way to preview unsaved buffer content; drafts never appear on the sifront
home page even for their author.

---

## 3. Design decisions

### 3.1 One new ui-sdk helper: `sifrontUrl(route, params?)`

```ts
// ui_sdk/src/base-url.ts (next to appBaseUrl), exported from index.ts
export function sifrontUrl(route: string, params: Record<string, string> = {}): string
```

- pretty mode → `mountPath() + '/article/x' + '?…'`
- query mode → `appBaseUrl() + '?p=/article/x&…'`

Same shape as `moduleUrl()` minus the `sifpress/` prefix: sifront routes are
root-mounted, so reusing `moduleUrl('article/x')` would emit
`/sifpress/article/x` (404 → construction page). One helper keeps the admin
correct in **both URL modes** — the exact thing `route_path()` does
server-side — and composes with the existing `withInspect(sifrontUrl('/'))`.

### 3.2 The marker keys off data, not a query parameter

Banner condition: `page.status === 'draft'` (already in the payload). It
cannot be spoofed into "looks live", needs no router/keep-list change,
disappears the moment you publish, and shows for a colleague's draft URL opened
cold. `?preview=…` stays reserved for phase 2b, where the client must say
"this content is not in the database".

### 3.3 Security posture: reuse the existing gate

The control is `can_edit_page()` in `pages.get` (unchanged); the banner is UX,
not access control. Previews are never linked from a public surface, draft
routes are already `noindex,nofollow` server-side, and both the JSON and the
shell are `no-cache`/`no-store`.

---

## 4. Phases

### Phase 1 — preview a *saved* draft (no backend change)

1. **ui-sdk**: add `sifrontUrl()`, export from `ui_sdk/src/index.ts`;
   `pnpm run typecheck` + `pnpm run format` in `ui_sdk`.
2. **Editor** (`admin_ui/src/pages/editor.tsx`, action cluster beside Save,
   ~line 1280): Eye button → `window.open(sifrontUrl('/article/' + slug))`.
   Disabled with `editor.previewNeedsSave` while `!editing`. Hidden in
   revision-preview mode (the amber strip already occupies that slot).
3. **List + detail**: `admin_ui/src/pages/article-index.tsx` (~line 149, next
   to Edit) and `admin_ui/src/pages/article-detail.tsx` (~line 174) get the
   same action; label depends on `article.status`.
4. **Sifront banner — sifpress1**: new
   `sifronts/sifpress1/src/components/draft-preview-banner.tsx` (glass style,
   hardcoded English — sifpress1 has no i18n), mounted at the top of
   `article.$slug.tsx` when `page.status === 'draft'`; `role="status"`, links
   back through the existing `adminEditorUrl(slug)`.
5. **Sifront banner — sifpress2**:
   - add `status` to the `Story` / `ArticlePage` mapping in
     `siffronts/sifpress2/src/lib/stories.ts` (it is dropped today);
   - banner component in the newsprint style;
   - copy follows the **one-key-per-string** rule: add
     `draftPreview: 'Draft — preview only'` to `DEFAULT_COPY` in
     `siffronts/sifpress2/src/lib/theme-config.tsx` (flows into `KEYS`
     automatically) **and** add `{ "sifpress2.copy.draftPreview": "Draft —
     preview only" }` to `require_keys` in `siffronts/sifpress2/meta.json` —
     the meta list is maintained by hand, so it must be edited too.
6. **Admin i18n**: `admin_ui/src/lib/i18n.ts` en + zh — `article.preview`,
   `editor.previewNeedsSave`.
7. **Build**: `pnpm run typecheck` / `pnpm run format` in `admin_ui`,
   `ui_sdk` and both sifronts, then `php build.php` and `php buildfront.php`
   (banner ships inside the sifront bundles).

### Phase 2 — preview *unsaved* content

- **2a · Save first, then open** (recommend shipping this as the Phase 1
  button behaviour): if the buffer is dirty or the page is new, run the
  existing `save` mutation, then open the tab. Zero new surface, works for
  `/admin/editor/new` (a slug appears on first save), and any validation error
  stays in the existing error box. Downside: previewing mutates the row (it is
  still a draft, so nothing public changes).
- **2b · Local buffer handoff**: on click, write
  `sessionStorage['sifpress.preview.<slug>'] = {title, content_md, ts}` and
  open `sifrontUrl('/article/<slug>', { preview: '1' })`. The siffront article
  route reads (and clears) the key before `pagesApi.get`, renders the buffer
  with an "Unsaved preview" strip and forces `noindex` through the existing
  `usePageMeta({ noindex: true })`. Requires adding `'preview'` to both
  siffronts' `createQueryRewrite(undefined, '', ['inspect', 'preview'])`
  keep-lists so it survives in-app navigation. Limits: same browser only; a
  never-saved slug has no route (falls back to 2a); oversize content
  (~5 MB sessionStorage cap) falls back to 2a with a notice.
- **2c · Shareable token** (only if reviewers without accounts become a
  requirement — open question): `pages.preview.create` (POST, `pages.write`
  **and** `can_edit_page`) stores `{token, page_id, title, content_md,
  expires_at}` — new table or a flagged revision — with a random 32-byte token
  and a 24 h TTL; `pages.preview.get` (public action) validates token + expiry
  and returns a page-shaped payload with `status: 'draft', preview: true`;
  the route becomes `/article/<slug>?preview=<token>` and the sifront passes it
  to `pagesApi.get`. Deliberately out of scope until asked.

### Phase 3 — later

- Revision preview in the sifront (`?revision=`): the editor's revision-preview
  mode currently has no site view; reuse 2b's handoff with the revision body.
- Home-page appearance: let an author see the draft in the sifront home list
  (drop `status: 'published'` for `can_edit` sessions + banner), i.e. how tags,
  cover and pagination will look before publishing.
- `hide_from_search` indication in the preview strip.

---

## 5. Test plan

Backend (curl — no browser needed):

```bash
# draft: guest 404, editor 200 with status=draft
curl -s 'http://localhost:5000/?p=sifpress/api&action=pages.get&slug=<draft>'            # {"error":"page not found"}
curl -s -b <editor-cookie> '…&action=pages.get&slug=<draft>' | grep -o '"status":"draft"'
# shell head: draft is noindex, published is not
curl -s 'http://localhost:5000/?p=/article/<draft>'  | grep -o 'noindex,nofollow'
curl -s 'http://localhost:5000/?p=/article/<live>'   | grep -o 'property="og:title"'
# public surfaces unchanged
curl -s 'http://localhost:5000/?p=sifpress/seo&action=sitemap' | grep -c '<draft-slug>'   # 0
```

Front: `pnpm run typecheck` + `pnpm run format` in `admin_ui`, `ui_sdk`,
`sifronts/sifpress1`, `sifronts/sifpress2`; `php build.php`;
`php buildfront.php`.

Manual (`./dev.sh`): draft → Preview opens a new tab with the strip and a
working Edit link; publish → same URL, strip gone; viewer account and
logged-out → "Article Not Found"; `?inspect=1` still outlines KV values; both
URL modes (`php dist/index.php rewrite --forget` to flip to `?p=`) — the
Preview link must resolve in both, which is the whole point of `sifrontUrl`.

---

## 6. Risks / open questions

- **Editor header is crowded** (published switch, hide-from-search switch,
  delete, Save): icon-only Eye vs labelled button, and Preview must not
  collide with the revision-preview banner.
- **sifpress2 copy key must reach `meta.json require_keys`** or installs fall
  back to the built-in default — correct text, but not admin-editable.
- **Older / third-party sifront bundles** will not render a banner (no code
  change forces it). The server gate still holds; call it out in release notes.
- **Preview for published pages**: still worth a "View live" action even
  though it is the production page — decide whether it is one button or two.
- **Stale banner in a reused tab**: the article query has
  `staleTime: 60_000`; a tab kept open across a publish shows the old state.
  2a opens a fresh tab; otherwise `invalidateQueries(['page', slug])` on save.
- **Demo/virtual page** (`demo_page`) has no `pages` row → no Preview button
  (it is never in `editing` state); confirm the sifront banner path is skipped.
