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

/**
 * Configuration loading. Looks for sifpress_config.php in the same directory
 * as the running artifact (index.php / sifpress.php). If absent, a default
 * config file is generated with sensible defaults.
 *
 * Config uses define() constants (WordPress-style) so accessing the file
 * directly over HTTP never leaks sensitive values.
 */
$sifpress_config_path = dirname(__FILE__) . '/sifpress_config.php';

/*
 * CLI runs skip the web auto-generation: the CLI `setup` command writes the
 * config itself, as the invoking user. The CLI dispatch lives at the end of the
 * assembled file (src/cli.php) so it runs after the MIGRATIONS constant is
 * defined; see sifpress_cli().
 */
if (PHP_SAPI !== 'cli' && !is_file($sifpress_config_path)) {
    $config_content = sifpress_config_template(dirname(__FILE__) . '/var/sifpress', '', '', '');

    if (@file_put_contents($sifpress_config_path, $config_content) === false) {
        http_response_code(500);
        exit(
            'Sifpress: cannot create ' . $sifpress_config_path . "\n"
            . 'The directory ' . dirname($sifpress_config_path)
            . " is not writable by the web server user.\n"
            . 'Run `php ' . basename(__FILE__) . ' setup` from a shell (as the web user) instead.'
        );
    }
}

if (is_file($sifpress_config_path)) {
    require_once $sifpress_config_path;
}

/**
 * The sifpress_config.php body, shared by the web auto-generation and the CLI
 * `setup` command. Values are emitted with var_export() so quotes/backslashes
 * cannot break out of the generated file.
 */
function sifpress_config_template(
    string $dbDir,
    string $adminPassword,
    string $manifestUrl,
    string $baseUrl
): string {
    $template = <<<'PHP'
<?php
/**
 * Sifpress configuration file.
 *
 * This file is auto-generated on first run. Edit the values below to
 * customise your installation. All values use define() so direct HTTP
 * access to this file will not leak configuration.
 */

/** Path to the folder that holds the SQLite database (sys.db inside). */
define('SIFPRESS_DB_DIR', %s);

/**
 * Admin password for the initial admin account (admin/admin by default).
 * Only used when the users table is empty (first migration).
 * Leave as empty string to use the built-in default.
 */
define('SIFPRESS_ADMIN_PASSWORD', %s);

/**
 * URL of the version-check manifest JSON.
 * Leave as empty string to use the built-in default.
 */
define('SIFPRESS_MANIFEST_URL', %s);

/**
 * Base URL used to build every generated link (admin UI, sifront, API,
 * assets). Normally the URL of this artifact, e.g.
 *
 *   https://example.com/index.php
 *   https://example.com/myapp/index.php
 *
 * Leave as empty string to derive it from the request (falling back to
 * the site_url SEO setting when one is configured). Behind a TLS-terminating
 * proxy this is detected from X-Forwarded-Proto / X-Forwarded-Ssl; set the
 * public https URL explicitly if your proxy does not forward either.
 */
define('SIFPRESS_BASE_URL', %s);
PHP;

    return sprintf(
        $template,
        var_export($dbDir, true),
        var_export($adminPassword, true),
        var_export($manifestUrl, true),
        var_export($baseUrl, true)
    );
}

const APP_NAME = 'Sifpress';
const APP_VERSION = '0.1.0';

/*
 * Update-check configuration. The manifest is a JSON document reporting the
 * latest release (see plan/version-check-and-update.md):
 *
 *   { "version": "0.2.0", "md5": "...", "url": "...", "size_bytes": 2710345,
 *     "notes": "..." }
 */
const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/liyu1981/sifpress/master/latest.json';
const UPDATE_MAX_BYTES = 200 * 1024 * 1024;
const UPDATE_FETCH_TIMEOUT = 30;

/*
 * Web fetch (AI assistant). Pages are converted to markdown by the
 * markdown.new service; the request is relayed server-side so the browser
 * never hits CORS. The client's User-Agent is forwarded to the service.
 */
const WEB_FETCH_ENDPOINT = 'https://markdown.new';
const WEB_FETCH_TIMEOUT = 30;
const WEB_FETCH_MAX_BYTES = 2 * 1024 * 1024;

/*
 * Fixed row id of the seeded `sifpress1` sifront (see
 * migrations/0015_sifpress1_sifront.sql). Dev builds serve its bundle
 * (dist/sifpress1.sifront) from disk instead of the DB content.
 */
const SIFRONT_SIFPRESS1_ID = 1001;

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
