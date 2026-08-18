# Website Tracking Feature Plan

## Goal

Add support for third-party analytics/tracking scripts (Google Analytics, Plausible,
Fathom, Matomo, etc.) so site admins can enable tracking without code changes.

## Design Principles

1. **Admin-configurable** — tracking scripts are entered as settings, not hardcoded.
2. **Privacy-aware** — tracking is off by default; no scripts load until explicitly enabled.
3. **SPA-compatible** — virtual page views (client-side route changes) must be tracked.
4. **No bloat** — zero tracking code ships when tracking is disabled (no dead JS).

---

## Architecture

### 1. Settings Storage

Add new rows to the existing `settings` SQLite table (via `setting_get`/`setting_set`):

| Key                      | Type   | Default | Description                                      |
|--------------------------|--------|---------|--------------------------------------------------|
| `tracking_enabled`       | `0|1`  | `0`     | Master switch                                    |
| `tracking_provider`      | string | `""`    | Provider id: `gtag`, `plausible`, `fathom`, `matomo` |
| `tracking_id`            | string | `""`    | Measurement ID / domain / site ID                |
| `tracking_script_url`    | string | `""`    | Optional custom script URL (for self-hosted)     |
| `tracking_anonymize_ip`  | `0|1`  | `1`     | Anonymize IP (GA-specific, passed as config)     |

No schema migration needed — `settings` is a key-value table, new keys are picked up
automatically via `setting_get()`.

### 2. Backend — `<head>` Script Injection

**File: `src/spa.php` → `serve_spa()`**

After the existing SEO/meta injection (line ~98) and before `</head>`, inject the
tracking script block:

```
$tracking = tracking_head_tags();
if ($tracking !== '') {
    $html = str_replace('</head>', $tracking . '</head>', $html);  // last </head>
}
```

**New helper in `src/spa.php` or `src/tracking.php`:**

```php
function tracking_head_tags(): string
{
    if (db_needs_migration()) return '';
    if (setting_get('tracking_enabled', '0') !== '1') return '';

    $provider = setting_get('tracking_provider', '');
    $id       = setting_get('tracking_id', '');
    $custom   = setting_get('tracking_script_url', '');

    if ($id === '' && $custom === '') return '';

    return match ($provider) {
        'gtag'     => gtag_snippet($id, $custom),
        'plausible' => plausible_snippet($id, $custom),
        'fathom'    => fathom_snippet($id, $custom),
        'matomo'    => matomo_snippet($id, $custom),
        default     => '',
    };
}
```

Each provider snippet function returns the appropriate `<script>` tag(s):

#### Google Analytics (gtag.js)

```php
function gtag_snippet(string $id, string $custom): string
{
    $url = $custom !== ''
        ? $custom
        : "https://www.googletagmanager.com/gtag/js?id=" . urlencode($id);
    $anonymize = setting_get('tracking_anonymize_ip', '1') === '1';

    return <<<HTML
<script async src="{$url}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','{$id}'{$anonymize ? ",'{anonymize_ip':true}" : ''});</script>
HTML;
}
```

#### Plausible

```php
function plausible_snippet(string $domain, string $custom): string
{
    $src = $custom !== '' ? $custom : "https://plausible.io/js/script.js";
    return <<<HTML
<script defer data-domain="{$domain}" src="{$src}"></script>
HTML;
}
```

#### Fathom

```php
function fathom_snippet(string $siteId, string $custom): string
{
    $src = $custom !== '' ? $custom : "https://cdn.usefathom.com/script.js";
    return <<<HTML
<script src="{$src}" data-site="{$siteId}"></script>
HTML;
}
```

#### Matomo

```php
function matomo_snippet(string $id, string $custom): string
{
    // $id = "tracking_url|site_id" or custom script URL
    if (str_contains($id, '|')) {
        [$url, $site] = explode('|', $id, 2);
    } else {
        $url  = $custom !== '' ? rtrim($custom, '/') : '';
        $site = $id;
    }
    if ($url === '') return '';
    $url = rtrim($url, '/');

    return <<<HTML
<script>var _paq=window._paq||[];_paq.push(['trackPageView']);_paq.push(['enableLinkTracking']);(function(){var u="{$url}/";_paq.push(['setTrackerUrl',u+"matomo.php"]);_paq.push(['setSiteId',"{$site}"]);var d=document,g=d.createElement('script'),s=d.getElementsByTagName('script')[0];g.async=true;g.src=u+"matomo.js";s.parentNode.insertBefore(g,s)})();</script>
HTML;
}
```

### 3. Frontend — SPA Virtual Pageview Tracking

Since TanStack Router handles all navigation client-side, the `<script>` in `<head>`
only fires on initial load. For subsequent route changes, the frontend must call
`gtag('event', 'page_view', ...)` (or equivalent) on each navigation.

**File: `frontend/src/router.tsx`** — add a `beforeNavigate` or `useEffect` hook
in `RootLayout` that fires on pathname changes:

```tsx
// In RootLayout or a dedicated hook
useEffect(() => {
    const path = window.location.pathname + window.location.search;
    // gtag SPA pageview
    if (typeof window.gtag === 'function') {
        window.gtag('event', 'page_view', { page_path: path });
    }
    // Plausible custom event
    if (typeof window.plausible === 'function') {
        window.plausible('pageview', { url: path });
    }
}, [pathname]);
```

This requires adding minimal type declarations for `window.gtag` and
`window.plausible` in `frontend/src/types.d.ts` (or inline ambient declarations).

### 4. Admin Settings UI

**File: `frontend/src/pages/settings.tsx`**

Add a new **Tracking** card in the settings page (below the existing SEO card):

Fields:
- Toggle: Enable tracking
- Select: Provider (Google Analytics / Plausible / Fathom / Matomo / Custom)
- Text: Measurement ID / Site ID
- Text: Custom script URL (optional, for self-hosted instances)
- Toggle: Anonymize IP (shown only when provider = `gtag`)

Uses the existing `settingsApi` pattern — extend the `SeoSettings` type (or create a
separate `TrackingSettings` type) and add a `tracking.get` / `tracking.update` API
action pair in `src/api.php`.

### 5. API Endpoints

**File: `src/api.php`** — add two actions:

```
tracking.get   → returns { enabled, provider, id, script_url, anonymize_ip }
tracking.update → PATCH with any subset of those fields
```

These follow the same pattern as `settings.get` / `settings.update`.

---

## File Changes Summary

| File                        | Change                                              |
|-----------------------------|-----------------------------------------------------|
| `src/tracking.php`          | **New** — `tracking_head_tags()` + provider snippets |
| `src/spa.php`               | Call `tracking_head_tags()`, inject before `</head>` |
| `src/api.php`               | Add `tracking.get` / `tracking.update` actions       |
| `frontend/src/types.d.ts`   | Ambient type for `window.gtag`, `window.plausible`   |
| `frontend/src/router.tsx`   | SPA pageview hook in `RootLayout`                    |
| `frontend/src/pages/settings.tsx` | Tracking settings card                          |
| `frontend/src/lib/pages.ts` | `trackingApi` type + fetch wrappers                  |
| `build.php`                 | Add `tracking.php` to the fragment concatenation list |

---

## Privacy Considerations

- Tracking is **off by default** — no scripts load, no data collected.
- IP anonymization is **on by default** for GA.
- The admin can paste any custom script URL, supporting privacy-focused alternatives
  (self-hosted Plausible, Umami, etc.).
- Private routes (`/editor`, `/settings`, `/login`, `/assets`) are marked
  `noindex,nofollow` by SEO — tracking scripts still load (admin's choice), but
  the pageview hook could optionally skip them if desired.

---

## Implementation Order

1. Create `src/tracking.php` with provider snippet functions
2. Modify `src/spa.php` to call and inject tracking tags
3. Add `tracking.get`/`tracking.update` API actions in `src/api.php`
4. Add `tracking.php` to `build.php` fragment list
5. Add frontend type declarations (`window.gtag`, `window.plausible`)
6. Add SPA pageview tracking hook in `router.tsx`
7. Add Tracking settings card in `settings.tsx`
8. Test: verify no tracking code loads when disabled, verify each provider snippet
