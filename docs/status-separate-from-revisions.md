# Plan: Decouple publish `status` from content revisions

Status: implemented

## Problem

Publish state currently rides along with content saves. `page_revisions` has a
`status` column and `pages` has a `status` column, and both are written by the
content path (`api_pages_create` / `api_pages_update`). Because
`compute_revision_hash()` deliberately excludes `status`, a status-only change
through `api_pages_update` hits the `$newHash === $currentHash` short-circuit
and is silently dropped. The interim attempt (writing `pages.status` in that
branch, plus a `pages.setStatus` action) fixes the symptom but puts status
mutation in the wrong layer and leaves the revision's own `status` stale.

The intended model: **status belongs to the revision and is mutated in place;
it is never part of the content identity, and never creates a revision.**

## Target model / invariants

1. **Revision identity is content only.** `compute_revision_hash()` must not
   include `status` (`sha1(slug|title|content_md|created_by|created_at)`).
2. **`page_revisions.status` is the per-revision source of truth.**
   Each revision records the publish state it had.
3. **`pages.status` is a denormalized cache of the current revision's status.**
   Every existing reader keeps using it: list/search filters
   (`api_pages_list`, `search_pages`, `api_status_param`), draft visibility
   (`api_pages_get`), sitemap (`seo.php`), and public surfaces.
4. **Toggling publish never inserts a revision and never changes
   `current_revision_id`.** It is an in-place `UPDATE page_revisions SET status`.
5. **Editing content creates a new revision that inherits the page's current
   status** (`pages.status`), so publishing state survives content edits.

## Data model

No schema change is needed. `pages.status` and `page_revisions.status` already
exist (migrations `0001`, `0016`). We only change which code path is allowed to
mutate them.

Optional one-time reconcile (only if we do not trust existing data):

```sql
UPDATE pages
   SET status = (SELECT r.status FROM page_revisions r
                  WHERE r.revision_id = pages.current_revision_id)
 WHERE current_revision_id IS NOT NULL;
```

Not required today: create/update/restore already keep the two in sync.
`page_revision.status` and `page.status` were verified consistent in the dev DB.

## Backend changes (`src/api.php`)

### 1. `api_pages_update` — status is read-only here

- Drop the status write added in the interim fix; the hash-unchanged branch
  just returns the page payload again.
- Force `$status = $page['status']`; ignore any `status` in the request body.
- Remove `status` from the update validation errors (it can no longer be
  changed through this endpoint).
- `$newFields['status'] = $page['status']`, so a newly created revision
  inherits the current publish state rather than a client-supplied one.

### 2. New `api_pages_revision_set_status` — the only status writer

Route action: `pages.revision.setStatus` (PATCH). Mirrors the naming of
`api_pages_revision_restore` / `pages.revision.restore`.

Pseudo-flow:

1. `require_permission('pages.write')`.
2. Parse `revision_id` + `status` from the JSON body.
3. Validate `status ∈ {draft, published}` → 422 otherwise.
4. `fetch_revision($revisionId)`; 404 if missing.
5. `fetch_page((int) $revision['page_id'])`; 404 if missing.
6. `require_page_edit($page)` (author / edit grant / admin).
7. Reject if `revision_id !== page.current_revision_id` → 409
   (`revision is not active`). Only the active revision's status is mutable.
8. `UPDATE page_revisions SET status = ? WHERE revision_id = ?`.
9. Mirror the cache: `UPDATE pages SET status = ? WHERE id = ?`
   (no `updated_at`/`updated_by` per decision 3).
10. Respond `{ revision: revision_payload(...), page: page_payload(...) }`.

Notes:
- No `commit_message` is required: no revision is created.
- The `pages` write fires the FTS sync trigger (`pages_au`) even though
  `title`/`content_md` are unchanged. Acceptable; the FTS row is rewritten
  identically. Avoided only by dropping the `pages.status` cache in favor of a
  current-revision JOIN, which is out of scope.

### 3. `api_pages_create` — keep the initial status

Keep `status` in the create payload as the seed for the first revision and the
page cache. This is the one place status arrives with content, and it does not
violate the invariants (status is still stored per-revision and outside the
hash). Revisit if we prefer "always create as draft, then toggle".

### 4. `api_pages_revision_restore` — unchanged

Already re-points `current_revision_id` and copies `slug/title/content_md/status`
from the revision into `pages`. That is exactly "restore this revision's status
too", and keeps the cache consistent.

### 5. Remove the interim `api_pages_set_status`

Delete the function, its `pages.setStatus` route, and the SDK method. Its job
is replaced by (2).

## SDK changes (`ui_sdk/src/pages.ts`)

- Add `pagesApi.setRevisionStatus(revisionId, status)` → PATCH
  `pages.revision.setStatus`, returning `{ revision, page }`.
- Remove `pagesApi.setStatus`.
- `PageUpdateInput`: drop `status` (Omit it as well), since update ignores it.
- `PageInput` (create): keep `status`.

## Admin UI changes (`admin_ui/src/pages/editor.tsx`)

- Replace the interim `setStatus`/`handlePublishedChange` mutation with one
  that calls `pagesApi.setRevisionStatus(page.current_revision_id, next)`.
- On success: update the `['page', slug]` cache and invalidate `['pages']`
  (and the `['page-revisions', page.id]` list so a per-revision badge refreshes).
- On error: revert the toggle to `page.status`, surface through `saveError`.
- Keep the switch disabled while the mutation is pending.
- Create mode: unchanged — local state feeds `SavePayload.status`.
- Revision-preview mode: see decisions (currently disabled).

## Data-flow walkthrough

- New article, toggle ON before first save → local `published=true`; create
  sends `status=published`; `pages.status` and revision 1's status are
  `published`. No extra call.
- Existing draft, toggle ON → PATCH revision status → revision row +
  `pages.status` become `published`; `current_revision_id` unchanged; revision
  count unchanged; no hash change.
- Existing article, edit body + Save → new revision inherits `pages.status`
  (the toggle state); hash changes only because content changed.
- Restore an old revision → page content + `pages.status` come from that
  revision's stored status.
- list/search/sitemap/visibility → unchanged, still read `pages.status`.

## Resolved decisions

1. **Status is always the active revision's status.** There is no editing of
   historical revisions. The toggle targets the page's current revision; a
   historical revision gains a status edit only after it is restored/set active
   (which makes it current). `api_pages_revision_set_status` therefore requires
   `revision_id === page.current_revision_id` and returns 409 otherwise.
2. **Revision-preview mode keeps the switch disabled.** Preview (`?revision=...`)
   is read-only; the user restores the revision first, then toggles it in the
   normal editor.
3. **A status toggle is not an "update".** It does not touch
   `pages.updated_at` or `pages.updated_by`, so the article list order and the
   "updated" display do not change. (The FTS sync trigger still fires on the
   `pages.status` cache write; harmless, noted below.)
4. **No legacy migration path in the app.** New installs always create
   revisions. Any repair of an old dev database is done with a throwaway
   one-off script, not a shipped endpoint. (The script also cleaned the two
   status-hashed revisions the interim build left behind.)
5. **Add a draft/published badge per revision** in the revision tree
   (`RevisionGraph` render prop in `editor.tsx`), using
   `editor.statusPublished` / `editor.statusDraft`.

## Backfill details (decision 4)

Throwaway script (`/tmp/sifpress_repair_revisions.py`, not committed):

1. Delete any revision whose `revision_id` does not equal the content hash
   `sha1(slug|title|content_md|created_by|created_at)` (interim status-hash
   artifacts).
2. For every page, compute the content hash of its current fields. If
   `current_revision_id` does not match, repoint to the existing revision with
   that hash, or insert one (`'Backfill revision'`) when none exists.

SQLite has no built-in `sha1`, so this cannot be a plain SQL migration.
Running it against the repaired dev DB is idempotent (`removed=0 repointed=0
created=0`).

## Result

Implemented as designed:

- `src/api.php`: `api_pages_update` ignores body `status` and inherits
  `pages.status`; new `api_pages_revision_set_status` (`pages.revision.setStatus`)
  mutates the active revision + cache; interim `api_pages_set_status` removed.
- `ui_sdk/src/pages.ts`: `setRevisionStatus` added, `setStatus` removed,
  `PageUpdateInput` drops `status`.
- `admin_ui/src/pages/editor.tsx`: toggle goes through `setRevisionStatus`;
  create keeps `status`, update omits it; draft/published badge in the revision
  tree.
- No `src/dev.php` changes; the one-time repair was a throwaway script.

Verified on a clean database with a 29-assertion curl suite (all pass),
including: status toggle changes page + revision without a new revision and
without bumping `updated_at`; non-current revision → 409; anonymous → 401;
`pages.update` ignores `status`; content saves inherit published/draft; restore
follows the revision's status; backfill repairs pages with a NULL current
revision.

## Verification results

- `pnpm run typecheck` (admin_ui + ui_sdk): pass.
- `php -l src/api.php`: pass.
- `php build.php` (dev): pass.
- 29/29 API assertions on a fresh DB.
- Throwaway repair script is idempotent on the repaired dev DB.
- Polluted dev DB (two status-hash revisions from the interim build) cleaned;
  page 10 repointed to its content hash `c97c26c6`.

## Verification (original plan)

- `pnpm run typecheck` in `admin_ui` (also runs `ui_sdk`), `php -l src/api.php`.
- `php build.php` (dev), serve, and drive with curl:
  - `pages.revision.setStatus` flips status; response status changes; revision
    count and `current_revision_id` unchanged; `pages.list` reflects it.
  - `pages.update` with a content change inherits `pages.status` and bumps the
    revision count; `status` in the update body is ignored.
  - `pages.update` with identical content (status in body) does **not** change
    status and does not create a revision.
  - `pages.revision.restore` restores that revision's status.
  - Non-owner editor without a grant gets 403; anonymous gets 401/403.
  - New article created with `status=published` seeds both rows.
- Confirm `page_revisions` has no duplicate/`UNIQUE` collision behavior when
  toggling (status is not hashed, so no insert occurs).
