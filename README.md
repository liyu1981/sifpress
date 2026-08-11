# Single PHP + React SPA — Rewrite‑Free Routing

This project creates a **single `index.php` production artifact** containing:

- PHP API routing
- React production JavaScript (inlined)
- React CSS (inlined)
- SPA HTML
- No separate asset files

The result is completely **independent of its installation path** and requires
**no rewrite rules at all** — no `.htaccess`, no Nginx `try_files`.

The exact same `index.php` can be copied to:

```text
https://example.com/index.php
https://example.com/myapp/index.php
https://example.com/tools/myapp/index.php
https://example.com/a/b/c/myapp/index.php
```

No rebuild is required.

## Routing model

Routing is done entirely with **query parameters**, which every web server
handles natively. There is nothing to configure.

| URL                                                    | Behavior              |
| ------------------------------------------------------ | --------------------- |
| `/index.php`                                           | React route `/`       |
| `/index.php?u=editor/123`                              | React route `/editor/123` |
| `/index.php?u=settings`                                | React route `/settings`  |
| `/index.php?module=api&action=hello`                   | JSON API              |
| `/index.php?module=api&action=projects`                | JSON API              |

The protocol is strict and predictable:

```text
module=api  -> server-side JSON API (action required)
u=...       -> client-side SPA route
anything    -> application parameters (handled by the app)
```

Because `u` is just a query parameter, the URLs are real and shareable:

```text
/index.php?u=editor/123
/index.php?u=settings
```

No `.htaccess`, no `#/` hash routing, no history-mode server rewrites.

## Build

Requirements:

- PHP CLI
- Node.js
- npm

Run:

```bash
php build.php
```

The script runs the Vite production build, **inlines all JavaScript and CSS
into the HTML**, and embeds that HTML into `index.php`. The build is
idempotent — you can run it repeatedly.

## Production deployment

After building, only one file is required:

```text
www/
└── index.php
```

That's it. No `.htaccess`, no Nginx config, no directory structure.

The same file works at `/`, `/myapp/`, or any deeper path. The browser makes
exactly **one HTTP request** per page load, because the JS and CSS are inlined.

## How it works

### Server side (`index.php`)

The entry point checks `?module`:

```php
$module = request_param('module');

if ($module === 'api') {
    handle_api((string) request_param('action', ''), $method);
}

$route = (string) request_param('u', '/');
serve_spa($route);
```

The API is a switch on `action`:

```php
case 'hello':
    json_response(['message' => 'Hello from PHP!']);

case 'projects':
    // GET list / POST create

default:
    json_response(['error' => 'Unknown action'], 404);
```

`serve_spa()` injects route-aware `<meta>`/`<title>` tags (optional SEO) and
echoes the fully inlined HTML.

### Client side (React)

React reads the same `u` parameter and does client-side navigation by
updating `?u=` with `history.pushState`:

```js
function readRoute() {
  const route = new URLSearchParams(window.location.search).get('u')
  return route == null || route === '' ? '/' : route
}

function navigate(route) {
  const query = new URLSearchParams(window.location.search)
  query.set('u', route)
  window.history.pushState({}, '', '?' + query.toString())
}
```

So the URL bar always shows real, shareable URLs and the browser back/forward
buttons work (via `popstate`).

### API URLs

Because the API lives behind the same `index.php`, React addresses it
relative to the current document — no base-path configuration is needed:

```js
const url = `${window.location.pathname}?module=api&action=hello`
```

This is why the identical bundle works at any mount depth.

## API

API routing lives directly inside `index.php`. For example:

```php
case 'hello':
    json_response([
        'message' => 'Hello from PHP!',
        'time'    => date(DATE_ATOM),
    ]);
```

You can replace this with:

- PDO / SQLite / MySQL / PostgreSQL
- authentication and sessions
- CRUD and file uploads
- background-job dispatch
- etc.

The architecture does not require a PHP framework.

## Adding a new SPA route

Client-side routes are declared in `frontend/src/main.jsx` via `matchRoute()`:

```js
function matchRoute(route) {
  const segments = route.split('/').filter(Boolean)
  if (segments[0] === 'editor') return { name: 'editor', params: { id: segments[1] } }
  return { name: 'notfound', params: {} }
}
```

Add a case there and a corresponding page component, then rebuild.

## Important security considerations

Before using this as a real production application:

- validate API input
- use PDO prepared statements
- implement authentication
- protect state-changing endpoints against CSRF where applicable
- use secure, HttpOnly cookies for sessions
- configure Content-Security-Policy
- configure appropriate CORS policy if needed
- disable PHP error display in production
- configure upload limits
- rate-limit sensitive endpoints
- never put secrets in the React bundle

The React bundle is public.

## SEO note

`/index.php?u=editor/123` is a real URL and is more crawler-friendly than a
hash route. PHP already injects a route-aware `<title>` and `<meta
name="description">`. For full SEO the PHP entry point can generate
route-specific open-graph tags while still serving the same React
application.

## Architecture

```text
                         Browser
                            │  (one request: JS + CSS inlined)
                            ▼
                    ┌───────────────┐
                    │   index.php   │
                    └───────┬───────┘
                            │
                    ┌───────┴───────┐
                    │               │
         ?module=api        ?u=... (and anything else)
              │                   │
              ▼                   ▼
         PHP JSON API          React SPA

The production server needs only:
    ONE index.php
    (no rewrite rules, no separate assets)
```

The production server does **not** need Node.js.