/**
 * Single-file PHP + React SPA — rewrite-free routing.
 *
 * The generated dist/index.php is completely portable and requires NO
 * rewrite rules (no .htaccess, no Nginx try_files):
 *
 *   https://example.com/index.php
 *   https://example.com/myapp/index.php
 *   https://example.com/tools/myapp/index.php
 *   https://example.com/a/b/c/myapp/index.php
 *
 * The same file works at any mount point. Routing is done entirely
 * with query parameters, which Apache/Nginx/any server handles natively.
 *
 *   /index.php                        -> React route "/"
 *   /index.php?u=editor/123           -> React route "/editor/123"
 *   /index.php?u=settings             -> React route "/settings"
 *   /index.php?module=api&action=hello -> API
 *   /index.php?module=api&action=projects -> API
 *
 * Source is split into fragments under src/ (bootstrap.php, api.php,
 * spa.php, embed.php, router.php). build.php assembles them and the
 * inlined React bundle into the single dist/index.php artifact.
 */

const APP_NAME = 'Single PHP React SPA';

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

/**
 * Read a single query parameter as a string (or the default).
 */
function request_param(string $name, ?string $default = null): ?string
{
    $value = $_GET[$name] ?? $default;

    return is_string($value) ? $value : $default;
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
