# Single PHP + React SPA — Base-Path Independent

This project creates a **single `index.php` production artifact** containing:

- PHP API routing
- React production JavaScript
- React CSS
- SPA HTML
- Static assets

The resulting application is **completely independent of its installation path**.

The exact same `index.php` can be copied to:

```text
https://example.com/
https://example.com/myapp/
https://example.com/tools/myapp/
https://example.com/a/b/c/myapp/
```

No rebuild is required.

## Build

Requirements:

- PHP CLI
- Node.js
- npm

Run:

```bash
php build.php
```

The script runs the Vite production build and embeds the generated files into `index.php`.

## Production deployment

After building, only these files are required:

```text
index.php
.htaccess
```

For example:

```text
/var/www/html/myapp/
├── index.php
└── .htaccess
```

The following all work:

```text
/myapp/
/myapp/editor/123
/myapp/settings

/myapp/api
/myapp/api/hello
/myapp/api/time
/myapp/api/projects
```

You can then move the same files to:

```text
/var/www/html/
```

and they become:

```text
/
/editor/123
/settings

/api
/api/hello
```

No code changes are necessary.

## How base-path detection works

PHP uses:

```php
$_SERVER['SCRIPT_NAME']
```

to determine where `index.php` is mounted.

For example:

```text
SCRIPT_NAME = /myapp/index.php
```

produces:

```text
base path = /myapp
```

while:

```text
SCRIPT_NAME = /tools/myapp/index.php
```

produces:

```text
base path = /tools/myapp
```

The incoming URL is then normalized relative to that base.

For example:

```text
/tools/myapp/api/projects
```

becomes internally:

```text
/api/projects
```

and therefore reaches the same API handler.

## React API URLs

The PHP response injects:

```html
<meta name="app-base-path" content="/myapp/">
```

React reads this value and constructs:

```text
/myapp/api/hello
/myapp/api/time
```

instead of assuming that the application lives at `/`.

Therefore the same JavaScript bundle works at arbitrary mount points.

## React assets

Vite is configured with:

```js
base: './'
```

and the build process normalizes the generated asset references into the embedded `/assets/...` namespace.

PHP then resolves:

```text
/myapp/assets/app-abc123.js
```

to:

```text
/assets/app-abc123.js
```

internally.

## SPA history routing

The `.htaccess` file sends unknown paths to `index.php`.

Therefore:

```text
/myapp/editor/123
```

does not need a physical directory:

```text
/myapp/editor/123/
```

PHP receives the request, sees that it is not an API or asset request, and returns the React application.

React can then implement client-side routing.

## Apache

`.htaccess`:

```apache
RewriteEngine On

RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]

RewriteRule ^ index.php [L]
```

Apache must allow `.htaccess` overrides, normally through:

```apache
AllowOverride FileInfo
```

or an equivalent virtual-host configuration.

## Nginx

Nginx does not support `.htaccess`.

Use an equivalent front-controller configuration:

```nginx
location / {
    try_files $uri $uri/ /index.php?$query_string;
}

location ~ \.php$ {
    include fastcgi_params;
    fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    fastcgi_pass unix:/run/php/php-fpm.sock;
}
```

Adjust the PHP-FPM socket to your system.

For an application mounted under a specific prefix, the corresponding `location` block should be scoped to that prefix.

## API

API routing lives directly inside `index.php`.

For example:

```php
if ($path === '/api/hello' && $method === 'GET') {
    json_response([
        'message' => 'Hello from PHP!',
    ]);
}
```

You can replace this with:

- PDO
- SQLite
- MySQL
- PostgreSQL
- authentication
- sessions
- CRUD
- file uploads
- background-job dispatch
- etc.

The architecture does not require a PHP framework.

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

## Architecture

```text
                         Browser
                            │
                            ▼
                    ┌───────────────┐
                    │   index.php   │
                    └───────┬───────┘
                            │
              ┌─────────────┼──────────────┐
              │             │              │
           /api/*       /assets/*       everything
              │             │              │
              ▼             ▼              ▼
         PHP JSON       embedded JS/CSS   React SPA
```

The important property is:

```text
ONE index.php
      +
ONE .htaccess
      ↓
portable application
```

The production server does not need Node.js.
