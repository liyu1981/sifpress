/**
 * Sifpress — single-file PHP + React SPA, rewrite-free routing.
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
 *   /index.php                                -> viewer SPA (construction page)
 *   /index.php?p=sifpress/admin/articles      -> admin SPA route
 *   /index.php?p=sifpress/admin/editor/123    -> admin SPA route
 *   /index.php?p=sifpress/api&action=hello    -> API
 *   /index.php?p=sifpress/api&action=projects -> API
 *
 * Source is split into fragments under src/ (bootstrap.php, api.php,
 * spa.php, embed.php, router.php). build.php assembles them and the
 * inlined React bundle into the single dist/index.php artifact.
 */

const APP_NAME = 'Sifpress';
const APP_VERSION = '0.1.0';

/*
 * Update-check configuration. The manifest is a JSON document reporting the
 * latest release (see plan/version-check-and-update.md):
 *
 *   { "version": "0.2.0", "md5": "...", "url": "...", "size_bytes": 2710345,
 *     "notes": "..." }
 */
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/liyu1981/sifpress/main/latest.json';
const UPDATE_MAX_BYTES = 200 * 1024 * 1024;
const UPDATE_FETCH_TIMEOUT = 30;

function request_method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

/**
 * Remove a leftover backup (`<artifact>.bak`) created by an in-app upgrade.
 * Runs on every request but is a no-op when no backup exists. The backup is
 * deleted once the running artifact is newer than it — i.e. the upgrade that
 * created it has already taken effect. Stale `<artifact>.new` staging files
 * (left behind by an interrupted install) are swept too.
 */
function maybe_clean_backup(): void
{
    $self = realpath(__FILE__);

    if ($self === false) {
        return;
    }

    $backup = $self . '.bak';

    if (is_file($backup)
        && @filemtime($backup) !== false
        && @filemtime($self) !== false
        && filemtime($backup) <= filemtime($self)) {
        @unlink($backup);
    }

    $staging = $self . '.new';

    if (is_file($staging)) {
        @unlink($staging);
    }
}

maybe_clean_backup();

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
