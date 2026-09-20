/**
 * ------------------------------------------------------------
 * Sifront bundles
 *
 * A `.sifront` is a ZIP archive with exactly two entries:
 *
 *   meta.json   identity + version + theme keys (require_keys, …)
 *   bundle.js   the app bundle (CSS/fonts inlined)
 *
 * The admin UI unpacks the archive (JSZip) and posts the two pieces to the
 * JSON API, so the backend never opens a ZIP: it stores `bundle`/`meta`/
 * `version` columns directly. For local iteration `buildfront.php` also
 * writes `<name>.bundle.js` / `<name>.meta.json` next to the artifact, which
 * a dev injection step reads instead of re-picking the ZIP.
 *
 * The CLI `update_sifront` command reads a real archive by shelling out to
 * the system `unzip(1)` (extracting to a temp dir), so the artifact needs
 * no php-zip / ext-zip dependency.
 * ------------------------------------------------------------
 */

/* Hard cap for a sifront's bundle.js. */
const SIFRONT_MAX_BUNDLE_BYTES = 8 * 1024 * 1024;

/**
 * Decode `dist/<name>.meta.json` (the dev companion written by
 * buildfront.php), or null when it isn't present.
 */
function sifront_dev_meta(string $name): ?array
{
    $path = __DIR__ . '/' . $name . '.meta.json';

    if (!is_file($path)) {
        return null;
    }

    $raw = file_get_contents($path);

    if ($raw === false) {
        return null;
    }

    $decoded = json_decode($raw, true);

    return is_array($decoded) ? $decoded : null;
}

/**
 * Read `dist/<name>.bundle.js` (the dev companion), or null when absent.
 */
function sifront_dev_bundle(string $name): ?string
{
    $path = __DIR__ . '/' . $name . '.bundle.js';

    if (!is_file($path)) {
        return null;
    }

    $data = file_get_contents($path);

    return $data === false || $data === '' ? null : $data;
}

/**
 * Read a `.sifront` archive by extracting it with the system `unzip(1)`
 * into a throwaway temp directory, then loading the two members. The temp
 * dir is always removed before returning. `-j` junks any directory prefixes
 * so a nested entry can never escape via `../`.
 *
 * @return array{meta: array, bundle: string, version: string}
 */
function sifront_read_archive(string $zipPath): array
{
    if (!is_file($zipPath)) {
        throw new RuntimeException("No such file: {$zipPath}");
    }

    if (!function_exists('exec')) {
        throw new RuntimeException('The exec() function is disabled; cannot run unzip(1).');
    }

    $dir = sys_get_temp_dir() . '/sifpress-sifront-' . bin2hex(random_bytes(6));

    if (!@mkdir($dir, 0700, true) && !is_dir($dir)) {
        throw new RuntimeException("Failed to create temp directory: {$dir}");
    }

    try {
        $output = [];
        $code = 0;
        exec(
            'unzip -o -j -qq -d ' . escapeshellarg($dir) . ' ' . escapeshellarg($zipPath) . ' 2>&1',
            $output,
            $code
        );

        if ($code !== 0) {
            $detail = trim(implode("\n", $output));

            throw new RuntimeException(
                'unzip failed' . ($detail === '' ? '' : ': ' . $detail)
                . ' (the system unzip(1) command is required)'
            );
        }

        $metaPath = $dir . '/meta.json';
        $bundlePath = $dir . '/bundle.js';

        if (!is_file($metaPath)) {
            throw new RuntimeException('Archive is missing meta.json.');
        }

        if (!is_file($bundlePath)) {
            throw new RuntimeException('Archive is missing bundle.js.');
        }

        $metaRaw = file_get_contents($metaPath);
        $bundle = file_get_contents($bundlePath);

        if ($metaRaw === false) {
            throw new RuntimeException('Failed to read meta.json.');
        }

        if ($bundle === false || $bundle === '') {
            throw new RuntimeException('bundle.js is empty.');
        }

        $meta = json_decode($metaRaw, true);

        if (!is_array($meta)) {
            throw new RuntimeException('meta.json is not a valid JSON object.');
        }

        if (strlen($bundle) > SIFRONT_MAX_BUNDLE_BYTES) {
            throw new RuntimeException('bundle.js exceeds the size cap.');
        }

        $version = is_string($meta['version'] ?? null) && $meta['version'] !== ''
            ? $meta['version']
            : '0.0.0';

        return ['meta' => $meta, 'bundle' => $bundle, 'version' => $version];
    } finally {
        sifront_rmdir($dir);
    }
}

/**
 * Upsert a sifront's bundle/meta/version by name, writing the same columns
 * the admin create/update flow uses. Creates the row when the name doesn't
 * exist yet; refuses to touch the built-in virtual sifront.
 *
 * @return array{id: int, created: bool, version: string}
 */
function sifront_store(string $name, array $meta, string $bundle, string $version): array
{
    $name = trim($name);

    if ($name === '' || mb_strlen($name) > 100) {
        throw new RuntimeException('Invalid sifront name.');
    }

    if ($bundle === '' || strlen($bundle) > SIFRONT_MAX_BUNDLE_BYTES) {
        throw new RuntimeException('bundle.js is empty or too large.');
    }

    $metaStr = json_encode($meta, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $metaStr = $metaStr === false ? '{}' : $metaStr;

    $stmt = db()->prepare('SELECT id, is_virtual FROM sifronts WHERE name = ?');
    $stmt->execute([$name]);
    $existing = $stmt->fetch();

    if ($existing !== false && (int) $existing['is_virtual'] === 1) {
        throw new RuntimeException("The built-in sifront '{$name}' cannot be updated.");
    }

    if ($existing === false) {
        db()->prepare(
            'INSERT INTO sifronts (name, content, meta, version, bundle, bundle_size, bundle_hash)'
            . " VALUES (?, '', ?, ?, ?, ?, ?)"
        )->execute([$name, $metaStr, $version, $bundle, strlen($bundle), md5($bundle)]);

        return ['id' => (int) db()->lastInsertId(), 'created' => true, 'version' => $version];
    }

    $id = (int) $existing['id'];
    db()->prepare(
        'UPDATE sifronts SET meta = ?, version = ?, bundle = ?, bundle_size = ?, bundle_hash = ?,'
        . " updated_at = datetime('now') WHERE id = ?"
    )->execute([$metaStr, $version, $bundle, strlen($bundle), md5($bundle), $id]);

    return ['id' => $id, 'created' => false, 'version' => $version];
}

/**
 * Recursively delete a directory (best-effort).
 */
function sifront_rmdir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }

    foreach (scandir($dir) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $path = $dir . '/' . $entry;
        is_dir($path) ? sifront_rmdir($path) : @unlink($path);
    }

    @rmdir($dir);
}
