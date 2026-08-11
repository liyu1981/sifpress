<?php
declare(strict_types=1);

/**
 * Single-file PHP + React SPA.
 *
 * The generated index.php is completely portable:
 *
 *   https://example.com/
 *   https://example.com/myapp/
 *   https://example.com/tools/myapp/
 *
 * The same file works at any mount point.
 */

const APP_NAME = 'Single PHP React SPA';

/**
 * Get the request path without query string.
 */
function request_path(): string
{
    $uri = $_SERVER['REQUEST_URI'] ?? '/';
    $path = parse_url($uri, PHP_URL_PATH);

    return is_string($path) && $path !== '' ? $path : '/';
}

/**
 * Determine the directory in which this PHP application is mounted.
 *
 * Examples:
 *
 *   /index.php              -> /
 *   /api/hello              -> /
 *   /myapp/index.php        -> /myapp
 *   /myapp/api/hello        -> /myapp
 *   /tools/myapp/foo        -> /tools/myapp
 *
 * SCRIPT_NAME is the most reliable source because it identifies
 * the actual front-controller script being executed.
 */
function app_base_path(): string
{
    $scriptName = $_SERVER['SCRIPT_NAME'] ?? '/index.php';

    $directory = str_replace('\\', '/', dirname($scriptName));

    if ($directory === '/' || $directory === '.' || $directory === '\\') {
        return '';
    }

    return rtrim($directory, '/');
}

/**
 * Convert an application URL into a path that can be compared
 * with REQUEST_URI.
 */
function app_relative_path(): string
{
    $path = request_path();
    $base = app_base_path();

    if ($base !== '') {
        if ($path === $base) {
            return '/';
        }

        if (str_starts_with($path, $base . '/')) {
            $path = substr($path, strlen($base));
        }
    }

    return $path === '' ? '/' : $path;
}

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function json_response(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');

    echo json_encode(
        $data,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
    );

    exit;
}

function read_json_body(): array
{
    $body = file_get_contents('php://input');

    if ($body === false || trim($body) === '') {
        return [];
    }

    $data = json_decode($body, true);

    if (!is_array($data)) {
        json_response(['error' => 'Invalid JSON body'], 400);
    }

    return $data;
}

/**
 * ------------------------------------------------------------
 * API
 * ------------------------------------------------------------
 */

function handle_api(string $path, string $method): never
{
    if ($path === '/api' || $path === '/api/') {
        json_response([
            'name' => APP_NAME,
            'status' => 'ok',
            'api' => true,
        ]);
    }

    if ($path === '/api/hello' && $method === 'GET') {
        json_response([
            'message' => 'Hello from PHP!',
            'time' => date(DATE_ATOM),
        ]);
    }

    if ($path === '/api/time' && $method === 'GET') {
        json_response([
            'unix' => time(),
            'iso' => date(DATE_ATOM),
        ]);
    }

    if ($path === '/api/projects' && $method === 'GET') {
        json_response([
            ['id' => 1, 'name' => 'First project'],
            ['id' => 2, 'name' => 'Second project'],
        ]);
    }

    if ($path === '/api/projects' && $method === 'POST') {
        $body = read_json_body();

        if (empty($body['name']) || !is_string($body['name'])) {
            json_response(['error' => 'name is required'], 422);
        }

        json_response([
            'id' => random_int(1000, 9999),
            'name' => $body['name'],
        ], 201);
    }

    json_response([
        'error' => 'API endpoint not found',
        'path' => $path,
        'method' => $method,
    ], 404);
}

/**
 * ------------------------------------------------------------
 * Embedded React application
 * ------------------------------------------------------------
 */

function serve_embedded_asset(string $path): never
{
    if (!isset(EMBEDDED_ASSETS[$path])) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Asset not found';
        exit;
    }

    $asset = EMBEDDED_ASSETS[$path];

    header('Content-Type: ' . $asset['mime']);
    header('Cache-Control: public, max-age=31536000, immutable');
    header('X-Content-Type-Options: nosniff');

    echo base64_decode($asset['data']);
    exit;
}

function serve_spa(): never
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');

    /*
     * React receives the base path through a meta tag.
     *
     * This is useful if application code needs to construct
     * application-relative URLs.
     */
    $base = app_base_path();
    $baseUrl = $base === '' ? '/' : $base . '/';

    $html = EMBEDDED_HTML;

    $html = str_replace(
        '</head>',
        '<meta name="app-base-path" content="' .
            htmlspecialchars($baseUrl, ENT_QUOTES | ENT_HTML5, 'UTF-8') .
            '">' .
        '</head>',
        $html
    );

    echo $html;
    exit;
}

const EMBEDDED_ASSETS = [
    // BUILD_ASSETS
];

const EMBEDDED_HTML = <<<'HTML'
<!-- BUILD_HTML -->
HTML;

/**
 * ------------------------------------------------------------
 * Main router
 * ------------------------------------------------------------
 */

$path = app_relative_path();
$method = request_method();

/*
 * API is always relative to the application's mount point.
 *
 * /api
 * /myapp/api
 * /tools/myapp/api
 *
 * all become /api here.
 */
if ($path === '/api' || str_starts_with($path, '/api/')) {
    handle_api($path, $method);
}

/*
 * Embedded Vite assets.
 *
 * Browser requests:
 *
 * /assets/app-abc123.js
 * /myapp/assets/app-abc123.js
 * /tools/myapp/assets/app-abc123.js
 *
 * are normalized to /assets/app-abc123.js.
 */
if (str_starts_with($path, '/assets/')) {
    serve_embedded_asset($path);
}

/*
 * Everything else is a React SPA route.
 */
serve_spa();
