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
 * the dev disk fast-path reads.
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
