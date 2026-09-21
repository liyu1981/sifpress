/**
 * ------------------------------------------------------------
 * Embedded React application
 *
 * All JavaScript and CSS are inlined into EMBEDDED_HTML at build
 * time, so dist/index.php is the single production artifact and no
 * asset requests need rewrite rules.
 * ------------------------------------------------------------
 */

/**
 * Sanitize an SPA route into a safe, single-segment identifier used
 * only for optional <meta> tags. React receives the raw route through
 * ?p= and is responsible for lookup/404 handling.
 */
function route_title_key(string $route): string
{
    $route = trim($route, '/');

    if ($route === '') {
        return '';
    }

    $first = explode('/', $route)[0];

    if (!preg_match('/^[A-Za-z0-9_-]+$/', $first)) {
        return '';
    }

    return $first;
}

/**
 * Static fallback HTML served when the DB is unavailable or no sifront
 * is configured. Matches the default seeded by seed_default_sifront().
 */
const SIFRONT_FALLBACK_HTML = '<!DOCTYPE html>'
    . '<html lang="en">'
    . '<head>'
    . '<meta charset="utf-8">'
    . '<meta name="viewport" content="width=device-width, initial-scale=1">'
    . '<title>' . APP_NAME . '</title>'
    . '<style>'
    . '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
    . 'body{min-height:100vh;display:flex;align-items:center;justify-content:center;'
    . 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
    . 'background:#f5f5f7;color:#1d1d1f}'
    . '.card{text-align:center;padding:3rem 2rem;max-width:28rem}'
    . 'h1{font-size:1.5rem;font-weight:600;margin-bottom:.5rem}'
    . 'p{color:#6e6e73;font-size:.95rem;line-height:1.5}'
    . '</style>'
    . '</head>'
    . '<body>'
    . '<div class="card">'
    . '<h1>' . APP_NAME . '</h1>'
    . '<p>This site is currently under construction. Please check back later.</p>'
    . '</div>'
    . '</body>'
    . '</html>';

/**
 * `<meta>` + inline script exposing the resolved base URL to the client,
 * so ui-sdk can build API/asset links and router hrefs from it instead of
 * assuming the document path.
 */
function base_url_meta(): string
{
    $base = base_url();
    $version = defined('UI_SDK_VERSION') ? (string) UI_SDK_VERSION : '';

    return '<meta name="sifpress-base-url" content="' . seo_esc($base) . '">'
        . '<script>window.SIFPRESS_BASE_URL=' . json_encode($base) . ';'
        . 'window.SIFPRESS_UI_VERSION=' . json_encode($version) . ';</script>';
}

/**
 * Insert a markup block into the real document <head>, i.e. the LAST
 * </head> in the page. The inlined JS bundles contain literal "</head>"
 * inside their own string literals (DOM parsers, React host config), so
 * replacing every occurrence would corrupt them.
 */
function inject_into_head(string $html, string $block): string
{
    $pos = strrpos($html, '</head>');

    if ($pos === false) {
        return $html;
    }

    return substr_replace($html, $block . '</head>', $pos, strlen('</head>'));
}

/**
 * Append the embedded ui-sdk content hash to its <script> URL. The bundle
 * is served `immutable` for a year, so the URL must change whenever its
 * content does — otherwise a stale module stays cached across rebuilds.
 */
function apply_ui_sdk_version(string $html): string
{
    if (!defined('UI_SDK_VERSION') || UI_SDK_VERSION === '') {
        return $html;
    }

    $needle = 'src="?p=sifpress/asset/js/ui-sdk.mjs"';

    if (!str_contains($html, $needle)) {
        return $html;
    }

    return str_replace(
        $needle,
        'src="?p=sifpress/asset/js/ui-sdk.mjs&v=' . UI_SDK_VERSION . '"',
        $html
    );
}

/**
 * Theme bootstrap from the old sifpress1 index.html: apply the stored theme
 * before first paint so glass surfaces don't flash. Inlined into <head>.
 */
function sifront_theme_bootstrap(): string
{
    return <<<'JS'
;(function () {
  var theme = localStorage.getItem('theme')
  var dark =
    theme === 'dark' ||
    ((theme === 'system' || theme === null) &&
      window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) document.documentElement.classList.add('dark')
})()
JS;
}

/**
 * HTML shell for a bundled sifront. The backend owns the document; the ZIP's
 * `bundle.js` is loaded as a module and injects its own styles.
 */
function sifront_shell_html(
    int $id,
    string $name,
    array $meta,
    string $version,
    string $hash = ''
): string {
    $title = is_string($meta['title'] ?? null) && $meta['title'] !== ''
        ? $meta['title']
        : $name;

    $metaJson = json_encode(
        $meta,
        JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
            | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT
    );

    if ($metaJson === false) {
        $metaJson = '{}';
    }

    $bundleSrc = '?p=sifpress/sifront-bundle&id=' . $id . '&v=' . rawurlencode($version);

    if ($hash !== '') {
        $bundleSrc .= '&h=' . rawurlencode($hash);
    }

    return '<!doctype html>'
        . '<html lang="en">'
        . '<head>'
        . '<meta charset="UTF-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
        . '<title>' . htmlspecialchars($title, ENT_QUOTES) . '</title>'
        . '<script>' . sifront_theme_bootstrap() . '</script>'
        . '<meta name="sifront_meta" content="' . htmlspecialchars($metaJson, ENT_QUOTES) . '">'
        . '<script type="module" src="?p=sifpress/asset/js/ui-sdk.mjs"></script>'
        . '<script type="module" src="' . $bundleSrc . '"></script>'
        . '</head>'
        . '<body><div id="root"></div></body>'
        . '</html>';
}

/**
 * Serve the active sifront page. Bundled sifronts get a generated shell
 * (the ZIP carries no HTML); legacy rows still serve their stored HTML, and
 * anything else falls back to the static construction page.
 */
function serve_sifront_page(): never
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');

    $html = '';

    if (!db_needs_migration()) {
        $activeId = (int) setting_get('active_sifront_id', '0');

        if ($activeId > 0) {
            $stmt = db()->prepare(
                'SELECT name, content, meta, version, bundle_size, bundle_hash'
                . ' FROM sifronts WHERE id = ?'
            );
            $stmt->execute([$activeId]);
            $row = $stmt->fetch();

            if ($row !== false) {
                $name = (string) $row['name'];
                $version = (string) $row['version'];
                $meta = json_decode((string) $row['meta'], true);
                $meta = is_array($meta) ? $meta : [];
                $isBundled = (int) $row['bundle_size'] > 0;

                if ($isBundled) {
                    $html = sifront_shell_html(
                        $activeId,
                        $name,
                        $meta,
                        $version,
                        (string) $row['bundle_hash']
                    );
                } else {
                    $content = (string) $row['content'];

                    if ($content !== '') {
                        $html = $content;
                    }
                }
            }
        }
    }

    if ($html === '') {
        $html = SIFRONT_FALLBACK_HTML;
    }

    serve_encoded_text(apply_ui_sdk_version(inject_into_head($html, base_url_meta())));
}

/**
 * Serve a sifront's `bundle.js` from the stored bytes. The URL is versioned,
 * so the response is safely immutable.
 */
function serve_sifront_bundle(): never
{
    $id = (int) request_param('id', '0');

    if ($id <= 0) {
        $id = (int) setting_get('active_sifront_id', '0');
    }

    $bundle = null;

    if ($id > 0 && !db_needs_migration()) {
        $stmt = db()->prepare('SELECT bundle FROM sifronts WHERE id = ?');
        $stmt->execute([$id]);
        $row = $stmt->fetch();

        if ($row !== false && $row['bundle'] !== null && $row['bundle'] !== '') {
            $bundle = (string) $row['bundle'];
        }
    }

    if ($bundle === null) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        echo 'bundle not found';
        exit;
    }

    header('Content-Type: text/javascript; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header(
        'Cache-Control: ' . (defined('SIFPRESS_DEV')
            ? 'no-cache'
            : 'public, max-age=31536000, immutable')
    );

    serve_encoded_text($bundle);
}

function serve_spa(string $route): never
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');

    $html = EMBEDDED_HTML;

    /*
     * Route-aware, optional SEO/meta injection. The static <title>
     * is stripped at build time, so the route-aware one (or the app
     * default) injected here is authoritative. React still renders
     * the full client-side content.
     */
    $key = route_title_key($route);

    $meta = '<meta name="app-route" content="' .
        htmlspecialchars($route, ENT_QUOTES | ENT_HTML5, 'UTF-8') .
        '">';
    $meta .= '<meta name="app-version" content="' .
        htmlspecialchars(APP_VERSION, ENT_QUOTES | ENT_HTML5, 'UTF-8') .
        '">';
    $meta .= '<script>window.APP_VERSION=' . json_encode(APP_VERSION) . ';</script>';
    $meta .= base_url_meta();

    /*
     * Rich SEO meta (title, description, OG/Twitter, canonical, JSON-LD)
     * resolved server-side. Skipped while migrations are pending — the
     * schema may not exist yet — in which case the generic route-key
     * fallback below applies.
     */
    if (!db_needs_migration()) {
        $seo = seo_meta_tags($route);
        $meta .= $seo;
    }

    if (!str_contains($meta, '<title>')) {
        $displayName = APP_NAME . ($key !== '' ? ' — ' . ucfirst($key) : '');
        $meta .= '<title>' . htmlspecialchars($displayName, ENT_QUOTES | ENT_HTML5, 'UTF-8') . '</title>';

        if ($key !== '') {
            $meta .= '<meta name="description" content="' .
                htmlspecialchars($displayName, ENT_QUOTES | ENT_HTML5, 'UTF-8') .
                '">';
        }
    }

    /*
     * Tell the client when the database needs migrating so it can show
     * the maintenance screen without an API round trip.
     */
    if (db_needs_migration()) {
        $meta .= '<meta name="app-maintenance" content="1">';
    }

    /*
     * Inject the meta block only into the real document <head>, i.e. the
     * LAST </head> in the served page. The inlined JS bundle (embedded in
     * <body>) contains literal "</head>" inside its own string literals
     * (DOM parsers, React host config), so replacing every occurrence
     * would corrupt the JS with raw HTML attributes and break parsing.
     * Because the whole bundle lives after </head>, the last occurrence is
     * always the genuine document head close.
     */
    $tracking = tracking_head_tags();
    if ($tracking !== '') {
        $meta .= $tracking;
    }

    if (!db_needs_migration()) {
        $faviconId = (string) setting_get('favicon_asset_id', '');
        $appleId = (string) setting_get('apple_touch_icon_asset_id', '');
        $faviconVersion = (string) setting_get('favicon_version', '0');

        if ($faviconId !== '' && $faviconId !== '0') {
            $faviconUrl = base_url() . '?p=sifpress/asset&id=' . $faviconId . '&v=' . $faviconVersion;
            $faviconMime = (string) setting_get('favicon_mime', 'image/svg+xml');
            $meta .= '<link rel="icon" type="' . seo_esc($faviconMime) . '" href="' . seo_esc($faviconUrl) . '">';
        } else {
            $meta .= '<link rel="icon" type="image/svg+xml" href="' . seo_esc(base_url() . '?p=sifpress/favicon') . '">';
        }

        if ($appleId !== '' && $appleId !== '0') {
            $appleUrl = base_url() . '?p=sifpress/asset&id=' . $appleId . '&v=' . $faviconVersion;
            $meta .= '<link rel="apple-touch-icon" href="' . seo_esc($appleUrl) . '">';
        }
    }

    serve_encoded_text(apply_ui_sdk_version(inject_into_head($html, $meta)));
}
