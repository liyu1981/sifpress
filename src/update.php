/**
 * ------------------------------------------------------------
 * Update-check & in-app upgrade
 *
 *   ?p=sifpress/update&action=status   GET   check latest release + capability
 *   ?p=sifpress/update&action=run      POST  download, verify, backup, replace
 *
 * The manifest (UPDATE_MANIFEST_URL) is a JSON document reporting the latest
 * release:
 *
 *   { "version": "0.2.0", "md5": "<hex>", "url": "https://.../sifpress.php",
 *     "size_bytes": 2710345, "notes": "..." }
 *
 * `status` is admin-only. `run` is admin-only and POST-only: it re-fetches the
 * manifest, streams the artifact to the system temp dir, verifies its md5,
 * sanity-checks it, backs up the current script to `<self>.bak`, then
 * atomically renames the new artifact over it (staged as `<self>.new` in the
 * same directory so rename() stays on one filesystem). The next request runs
 * the new code, whose bootstrap cleans up the backup.
 *
 * When the script's directory is not writable, `status` reports
 * `can_upgrade: false` and the frontend falls back to manual instructions.
 * ------------------------------------------------------------
 */

/**
 * The artifact's own resolved path (the deployed single-file script).
 */
function update_self_path(): string
{
    $path = realpath(__FILE__);

    return $path !== false ? $path : __FILE__;
}

/**
 * The update manifest URL. Defaults to UPDATE_MANIFEST_URL; the
 * SIFPRESS_UPDATE_MANIFEST_URL env var overrides it (mirrors the APP_DB_DIR
 * pattern) so operators can point the check at their own release channel.
 */
function update_manifest_url(): string
{
    $env = getenv('SIFPRESS_UPDATE_MANIFEST_URL');

    return $env !== false && $env !== '' ? $env : UPDATE_MANIFEST_URL;
}

/**
 * Whether a URL is acceptable for the update check/download. HTTPS is
 * required in production; loopback http is allowed for local testing.
 */
function is_allowed_update_url(string $url): bool
{
    if (preg_match('#^https://#i', $url)) {
        return true;
    }

    if (preg_match('#^http://(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?/#i', $url)) {
        return true;
    }

    return false;
}

/**
 * Fetch a remote URL and return the raw body as a string, or null on any
 * transport failure (network, non-2xx, HTTPS enforcement). Uses curl when
 * available, else file_get_contents with a stream context.
 */
function http_get(string $url, int $timeout = 10): ?string
{
    if (!is_allowed_update_url($url)) {
        return null;
    }

    $body = null;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);

        if ($ch !== false) {
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 3,
                CURLOPT_CONNECTTIMEOUT => $timeout,
                CURLOPT_TIMEOUT => $timeout,
                CURLOPT_USERAGENT => APP_NAME . '/' . APP_VERSION,
            ]);
            $result = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);

            if ($result !== false && $status >= 200 && $status < 300) {
                $body = $result;
            }
        }
    }

    if ($body === null && ini_get('allow_url_fopen')) {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => $timeout,
                'follow_location' => 1,
                'max_redirects' => 3,
                'user_agent' => APP_NAME . '/' . APP_VERSION,
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);
        $result = @file_get_contents($url, false, $context);

        if ($result !== false) {
            $body = $result;
        }
    }

    return $body;
}

/**
 * Fetch a remote URL and return the decoded JSON, or null on any failure.
 */
function http_get_json(string $url, int $timeout = 10): ?array
{
    $body = http_get($url, $timeout);

    if ($body === null || trim($body) === '') {
        return null;
    }

    $data = json_decode($body, true);

    return is_array($data) ? $data : null;
}

/**
 * Fetch and validate the update manifest. Returns
 * `{ manifest: ?array, error: ?string }` where `error` is `'network'` when the
 * URL could not be fetched and `'bad_json'` when it fetched but failed
 * validation.
 */
function fetch_update_manifest(): array
{
    $body = http_get(update_manifest_url(), UPDATE_FETCH_TIMEOUT);

    if ($body === null || trim($body) === '') {
        return ['manifest' => null, 'error' => 'network'];
    }

    $data = json_decode($body, true);

    if (!is_array($data)
        || !isset($data['version'])
        || !is_string($data['version'])
        || trim($data['version']) === '') {
        return ['manifest' => null, 'error' => 'bad_json'];
    }

    return [
        'manifest' => [
            'version' => trim($data['version']),
            'md5' => isset($data['md5']) && is_string($data['md5']) ? strtolower(trim($data['md5'])) : '',
            'url' => isset($data['url']) && is_string($data['url']) ? $data['url'] : null,
            'size_bytes' => isset($data['size_bytes']) ? (int) $data['size_bytes'] : null,
            'notes' => isset($data['notes']) && is_string($data['notes']) ? $data['notes'] : null,
        ],
        'error' => null,
    ];
}

/**
 * Whether the script's directory and the system temp dir are writable,
 * which is what an in-app upgrade needs.
 */
function update_capabilities(): array
{
    $self = update_self_path();
    $dir = dirname($self);
    $selfWritable = is_writable($dir) && is_writable($self);
    $tmpWritable = is_writable(sys_get_temp_dir());

    return [
        'self_path' => $self,
        'self_writable' => $selfWritable,
        'tmp_writable' => $tmpWritable,
        'can_upgrade' => $selfWritable && $tmpWritable,
    ];
}

/**
 * Stream the manifest's artifact into the system temp dir, enforcing a size
 * cap and a download timeout. Returns the temp path, or null on failure.
 */
function download_to_temp(string $url): ?string
{
    if (!is_allowed_update_url($url)) {
        return null;
    }

    $tmp = tempnam(sys_get_temp_dir(), 'sifpress-update-');

    if ($tmp === false) {
        return null;
    }

    $out = @fopen($tmp, 'wb');

    if ($out === false) {
        @unlink($tmp);
        return null;
    }

    $ok = false;

    if (function_exists('curl_init')) {
        $ch = curl_init($url);

        if ($ch !== false) {
            curl_setopt_array($ch, [
                CURLOPT_FILE => $out,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 3,
                CURLOPT_CONNECTTIMEOUT => UPDATE_FETCH_TIMEOUT,
                CURLOPT_TIMEOUT => UPDATE_FETCH_TIMEOUT,
                CURLOPT_USERAGENT => APP_NAME . '/' . APP_VERSION,
                CURLOPT_NOPROGRESS => true,
            ]);
            $ok = curl_exec($ch) === true
                && (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE) >= 200
                && (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE) < 300;
            curl_close($ch);
        }
    } elseif (ini_get('allow_url_fopen')) {
        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'timeout' => UPDATE_FETCH_TIMEOUT,
                'follow_location' => 1,
                'max_redirects' => 3,
                'user_agent' => APP_NAME . '/' . APP_VERSION,
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
            ],
        ]);
        $src = @fopen($url, 'rb', false, $context);

        if ($src !== false) {
            $ok = true;
            while (!feof($src)) {
                $chunk = fread($src, 65536);

                if ($chunk === false) {
                    $ok = false;
                    break;
                }

                if (ftell($out) + strlen($chunk) > UPDATE_MAX_BYTES) {
                    $ok = false;
                    break;
                }

                fwrite($out, $chunk);
            }
            fclose($src);
        }
    }

    fclose($out);

    if (!$ok || filesize($tmp) === false || filesize($tmp) > UPDATE_MAX_BYTES) {
        @unlink($tmp);
        return null;
    }

    return $tmp;
}

/**
 * Install a validated artifact: stage it as `<self>.new` in the script's own
 * directory (same filesystem, so rename() is atomic), then rename over the
 * script. Cleans up the temp download.
 */
function install_artifact(string $tmp): void
{
    $self = update_self_path();
    $staging = $self . '.new';

    $bytes = file_get_contents($tmp);

    if ($bytes === false) {
        throw new RuntimeException('Could not read downloaded artifact');
    }

    if (file_put_contents($staging, $bytes) === false) {
        throw new RuntimeException('Could not stage new artifact');
    }

    @unlink($tmp);

    if (!rename($staging, $self)) {
        @unlink($staging);
        throw new RuntimeException('Could not replace the script');
    }
}

/**
 * Copy the current script to `<self>.bak` before an upgrade.
 */
function backup_artifact(): void
{
    $self = update_self_path();
    $backup = $self . '.bak';

    if (!copy($self, $backup)) {
        throw new RuntimeException('Could not back up the current script');
    }
}

function handle_update(string $action, string $method): never
{
    /*
     * Migrations lock out auth (no sessions/users tables yet), so the app is
     * on the MaintenanceScreen and the update module is unreachable anyway.
     * Refuse explicitly rather than fatal.
     */
    if (db_needs_migration()) {
        json_response(['error' => 'migration_required'], 503);
    }

    $user = require_auth();

    if (!is_admin($user)) {
        json_response(['error' => 'forbidden', 'permission' => 'admin'], 403);
    }

    switch ($action) {
        case '':
        case 'status':
            if ($method !== 'GET') {
                json_response(['error' => 'Method not allowed'], 405);
            }

            $result = fetch_update_manifest();
            $manifest = $result['manifest'];
            $latest = $manifest['version'] ?? null;
            $updateAvailable = $latest !== null
                && version_compare($latest, APP_VERSION, '>');
            $ahead = $latest !== null
                && version_compare(APP_VERSION, $latest, '>');

            json_response([
                'current_version' => APP_VERSION,
                'latest_version' => $latest,
                'update_available' => $updateAvailable,
                'ahead' => $ahead,
                'fetch_error' => $result['error'],
                'manifest' => $manifest,
                ...update_capabilities(),
            ]);

        case 'run':
            if ($method !== 'POST') {
                json_response(['error' => 'Method not allowed'], 405);
            }

            $result = fetch_update_manifest();
            $manifest = $result['manifest'];

            if ($manifest === null) {
                json_response(['error' => 'could not fetch manifest'], 502);
            }

            $latest = $manifest['version'];

            if ($latest === null || !version_compare($latest, APP_VERSION, '>')) {
                json_response(['error' => 'already up to date'], 409);
            }

            $caps = update_capabilities();

            if (!$caps['can_upgrade']) {
                json_response(['error' => 'not writable'], 403);
            }

            $url = $manifest['url'];

            if ($url === null || $url === '') {
                json_response(['error' => 'manifest missing download url'], 422);
            }

            $tmp = download_to_temp($url);

            if ($tmp === null) {
                json_response(['error' => 'download failed'], 502);
            }

            $md5 = md5_file($tmp);

            if ($md5 === false
                || ($manifest['md5'] !== '' && $md5 !== $manifest['md5'])) {
                @unlink($tmp);
                json_response(['error' => 'checksum mismatch'], 502);
            }

            $head = @file_get_contents($tmp, false, null, 0, 5);

            if ($head !== '<?php') {
                @unlink($tmp);
                json_response(['error' => 'invalid artifact'], 422);
            }

            try {
                backup_artifact();
                install_artifact($tmp);
            } catch (Throwable $e) {
                json_response(['error' => $e->getMessage()], 500);
            }

            json_response([
                'ok' => true,
                'previous_version' => APP_VERSION,
                'new_version' => $latest,
            ]);

        default:
            json_response(['error' => 'Unknown update action'], 404);
    }
}
