# Plan — Version Check & In-App Update

Single-file Sifpress currently carries a static `APP_VERSION` (`src/bootstrap.php`,
served to the SPA via `spa.php`'s `<meta name="app-version">` and shown in the
footer). This plan adds:

1. **Check** — the artifact fetches a remote manifest (JSON) that reports the
   latest release version + md5, and compares it against the running script's
   own version.
2. **Upgrade** — two paths:
   - **Writable** (artifact dir + system tmp both writable): an in-app button
     downloads → validates md5 → backs up the current script → atomically
     replaces it. The next boot cleans up the backup.
   - **Read-only**: the UI shows download → verify → copy instructions instead
     of a button.

---

## 1. Design decisions (locked)

- **New module `?module=update`** in the router (a new `src/update.php`
  fragment), not an `api.php` action — it is a file/ops concern, shares nothing
  with the DB API, and mirrors the existing `?module=migration` pattern.
- **Manifest is a plain JSON document** served over HTTPS (GitHub Releases / raw
  file). Schema is fixed (see §2). `UPDATE_MANIFEST_URL` is a constant in
  `bootstrap.php` so operators can point the check at a mirror or their own
  release channel.
- **Version compare via `version_compare()`** (handles semver). Equal → "up to
  date"; local version newer than latest → "ahead of latest" (dev builds),
  no upgrade offered.
- **The artifact is its own path**: inside the assembled file, `__FILE__`
  resolves to the deployed script (the fragments are one file). All file ops
  use `realpath(__FILE__)` so symlinked deployments still update the target.
- **Replacement is atomic**: download lands in `sys_get_temp_dir()` (the "tmp
  folder"), md5 is verified there, then the bytes are copied to
  `<artifact>.new` *in the artifact's own directory* and `rename()`d over the
  script. `rename()` within one directory cannot cross devices.
- **Backup cleanup is a bootstrap-side mtime check** (cheap: only runs when a
  `.bak` file exists). The new artifact's mtime is newer than the backup's ⇒
  the upgrade already happened ⇒ unlink the backup. No md5-of-whole-file per
  request.
- **Upgrade is admin-only and POST-only** (a mutation). SameSite=Lax cookie
  already mitigates CSRF for the app's other POST endpoints; stay consistent.
- **The downloaded file is never executed in-process.** Validation = md5 match
  + `<?php` header + size sanity (min/max caps). Optional deeper check
  (`php -l` via proc_open) is flagged as a stretch, not a requirement.

## 2. Manifest contract

`UPDATE_MANIFEST_URL` returns:

```json
{
  "version": "0.2.0",
  "md5": "<hex md5 of the release artifact sifpress.php>",
  "url": "https://github.com/liyu1981/sifpress/releases/download/v0.2.0/sifpress.php",
  "size_bytes": 2710345,
  "notes": "Optional changelog / release notes"
}
```

- `version` + `md5` are required; `url`/`size_bytes`/`notes` optional.
- Malformed / non-JSON / missing fields ⇒ treated as "check failed", never a
  crash; the UI shows the error and keeps the manual path available.
- Publishing flow (maintainer side): bump `APP_VERSION`, build `rel.sh`,
  upload `sifpress.php` to a GitHub Release, publish `latest.json` matching.
  (See §7.)

## 3. Backend

### 3.1 `src/bootstrap.php` additions

```php
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/liyu1981/sifpress/main/latest.json';
```

### 3.2 New fragment `src/update.php`

`handle_update(string $action, string $method): never` dispatched from
`router.php`:

```php
if ($module === 'update') {
    handle_update((string) request_param('action', 'status'), $method);
}
```

Wired into `build.php` `$parts` **after** `auth.php` (it needs
`require_auth()`/`is_admin()`) and before `router.php`; included in BOTH dev
and release — it is a production feature, not dev-only.

**Helpers**

- `update_self_path(): string` — `realpath(__FILE__)`.
- `http_get_json(string $url, int $timeout = 10): ?array` — curl if available,
  else `file_get_contents` with a stream context (requires `allow_url_fopen`).
  Returns `null` on any failure. HTTPS-only by default (reject non-https unless
  `UPDATE_MANIFEST_URL` explicitly opts in).
- `update_manifest(): ?array` — fetch + `json_decode` + field validation.
- `update_capabilities(): array` — `self_writable`
  (`is_writable(dirname($self))` **and** `is_writable($self)`), `tmp_writable`
  (`is_writable(sys_get_temp_dir())`), `can_upgrade` = both true.
- `download_to_temp(string $url): ?string` — streams to
  `sys_get_temp_dir()/sifpress-update-<rand>.tmp`, caps size
  (`UPDATE_MAX_BYTES`, ~200 MB), 30s timeout, returns temp path.
- `install_artifact(string $tmp): void` — `file_get_contents` tmp → write
  `<self>.new` (same dir) → `rename(<self>.new, self)` → `unlink($tmp)`.
- `backup_artifact(): void` — copy current file to `<self>.bak` (using
  `realpath` target) before install.
- `maybe_clean_backup(): void` — if `is_file(<self>.bak)` and its mtime is
  **older** than `filemtime($self)`, `unlink` it. Called from `bootstrap.php`
  after constants (guarded: no-op when no `.bak` exists, so ~zero cost on
  steady-state requests).

### 3.3 Endpoints

**`GET ?module=update&action=status`** — admin-only
(`require_auth()` + `is_admin()`). Returns:

```json
{
  "current_version": "0.1.0",
  "latest_version": "0.2.0",
  "update_available": true,
  "ahead": false,
  "fetch_error": null,
  "manifest": {
    "version": "0.2.0",
    "md5": "...",
    "url": "...",
    "notes": null
  },
  "can_upgrade": true,
  "self_path": "/var/www/sifpress.php",
  "self_writable": true,
  "tmp_writable": true
}
```

- `update_available` = `latest > current`; `ahead` = `current > latest`.
- `fetch_error` is a short i18n-able code (`network`, `bad_json`, `offline`)
  when the manifest can't be reached — UI renders the manual path either way.
- On `db_needs_migration()` this returns `{ error: 'migration_required' }`
  (the app is on the MigrationScreen anyway; upgrade itself is file-only and
  could skip DB, but keeping the whole module uniformly admin-gated is simpler
  — noted as an accepted limitation).

**`POST ?module=update&action=run`** — admin-only.

Flow:
1. Re-fetch manifest (fresh, not cached). Require `update_available`, else 409.
2. `download_to_temp()` — fail 502 on fetch error, 413 if over size cap.
3. Verify `md5_file($tmp) === manifest.md5` — mismatch ⇒ 502 + cleanup, keep the
   backup un-touched.
4. Sanity: bytes start with `<?php`, `size >= 1000`, `<= UPDATE_MAX_BYTES`.
5. `backup_artifact()` (copy current → `<self>.bak`).
6. `install_artifact()` (write `<self>.new` in same dir → rename over).
7. Respond `{ ok: true, previous_version, new_version }`.
8. The request still runs the OLD code (already parsed); on the **next** request
   the new script's bootstrap sees the stale backup and deletes it.

## 4. Frontend

### 4.1 API lib — `frontend/src/lib/update.ts`

```ts
export interface UpdateStatus {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  ahead: boolean;
  fetch_error: string | null;
  manifest: { version: string; md5: string; url?: string; notes?: string } | null;
  can_upgrade: boolean;
  self_path: string;
  self_writable: boolean;
  tmp_writable: boolean;
}
export const updateApi = {
  status: () => moduleRequest<UpdateStatus>('update', 'status'),
  run: () => moduleRequest<{ ok: true; previous_version: string; new_version: string }>(
    'update', 'run', { method: 'POST' },
  ),
};
```

### 4.2 Settings → Update tab

- New `TabsTrigger` value `update` in `settings.tsx`, rendered **only when
  `user.roles` includes `admin`** (same guard as `canManageUsers`).
- New `UpdateCard` component (same Card/glass styling as `SystemSettingsCard`):
  - **Idle**: shows current version, "Check for updates" button.
  - **Checking**: spinner.
  - **Latest / ahead**: green/neutral status line; no action.
  - **Update available + `can_upgrade`**: shows `current → latest`,
    release notes if present, and an **"Upgrade"** button →
    `confirm()` dialog → `updateApi.run()` → success toast +
    "reload to finish" (`window.location.reload()` button).
  - **Update available + `!can_upgrade`**: no button. Shows download URL
    (open in new tab), the expected md5, and the manual routine:
    ```
    # 1. backup
    cp sifpress.php sifpress.php.bak
    # 2. download (browser: use the link above)
    # 3. verify
    echo "<md5>  sifpress.php" | md5sum -c -
    # 4. replace (path shown: <self_path>)
    mv sifpress.php <self_path>
    # 5. reload the page
    ```
  - **Fetch error**: shows the current version + an error hint; download link
    and md5 may be unavailable, but the manual path (with a link to the
    GitHub releases page) is still shown.
- Use TanStack Query (`queryKey: ['update','status']`, `staleTime` short) so
  navigating to the tab re-checks without hammering the manifest.

### 4.3 i18n

Add `update.*` keys to `frontend/src/lib/i18n.ts` in both `en` and `zh`:
current/latest labels, check button, upgrade button, up-to-date / ahead /
available lines, manual-instructions block, `can_upgrade` hint, error codes,
success + reload copy, tab label.

## 5. Edge cases & risks

- **Manifest unreachable** ⇒ check reports `fetch_error`, upgrade button never
  appears, manual path still works. The check is on-demand (settings tab), so a
  slow/no network does not affect normal browsing.
- **md5 mismatch / corrupt download** ⇒ 502, temp cleaned up, backup untouched;
  current script stays as-is (never partially replaced).
- **Install fails mid-rename** ⇒ `<self>.new` may linger; next `run` or a
  bootstrap sweep can remove stale `<self>.new` files (add to
  `maybe_clean_backup`/a `maybe_clean_stale()`).
- **Symlinked deployment** ⇒ operate on `realpath(__FILE__)`, so the target is
  updated; document that the symlink's own dir needs to be writable to rename.
- **Downgrade / same version** ⇒ `run` refuses (409) unless
  `latest > current`.
- **`allow_url_fopen=Off` + no curl** ⇒ fetch fails cleanly (see above); the
  manual download path is unaffected.
- **PHP process can't write its own dir** (common on shared hosting) ⇒
  `can_upgrade: false` automatically → manual instructions.
- **Admin-only** ⇒ non-admin users never see the tab; `handle_update` enforces
  auth server-side regardless of UI.
- **Migration-pending state** ⇒ module returns `migration_required` (app is on
  MigrationScreen; accepted limitation — upgrade via manual path or CLI).

## 6. Implementation checklist

1. `src/bootstrap.php`: add `UPDATE_MANIFEST_URL` (+ size/timeout constants),
   add `maybe_clean_backup()` call.
2. New `src/update.php`: helpers (§3.2) + `handle_update` with `status`/`run`.
3. `src/router.php`: dispatch `module=update`.
4. `build.php`: add `update.php` to `$parts` (both modes); update header doc.
5. Rebuild + curl-test `?module=update&action=status` (auth as admin) and a
   simulated `run` (e.g. point manifest at a local file via override, or a
   test URL), verify backup + replace + next-boot cleanup.
6. Frontend `lib/update.ts`, `UpdateCard`, settings tab, i18n keys.
7. `pnpm run format` + `pnpm run typecheck` + `php build.php release` all pass.
8. Update README (optional): document the manifest publishing flow.
