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
 * Serve the active sifront page. Falls back to the static HTML when the
 * DB is not migrated, no active sifront is configured, or the row is
 * missing.
 */
function serve_sifront_page(): never
{
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');

    if (!db_needs_migration()) {
        $activeId = (string) setting_get('active_sifront_id', '');

        if ($activeId !== '' && $activeId !== '0') {
            /*
             * Dev builds only: the seeded `sifpress1` entry keeps empty
             * DB content and is served straight from the built bundle on
             * disk, so front-end iteration needs no re-upload. A missing
             * bundle falls through to the normal DB/fallback path.
             */
            if (defined('SIFPRESS_DEV') && (int) $activeId === SIFRONT_SIFPRESS1_ID) {
                $bundle = file_get_contents(__DIR__ . '/sifpress1.sifront');

                if ($bundle !== false) {
                    echo $bundle;
                    exit;
                }
            }

            $stmt = db()->prepare('SELECT content FROM sifronts WHERE id = ?');
            $stmt->execute([(int) $activeId]);
            $content = $stmt->fetchColumn();

            if ($content !== false && $content !== '') {
                echo $content;
                exit;
            }
        }
    }

    echo SIFRONT_FALLBACK_HTML;
    exit;
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

    $pos = strrpos($html, '</head>');
    if ($pos !== false) {
        $html = substr_replace($html, $meta . '</head>', $pos, strlen('</head>'));
    }

    echo $html;
    exit;
}
