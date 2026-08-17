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
 * ?u= and is responsible for lookup/404 handling.
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
    $pos = strrpos($html, '</head>');
    if ($pos !== false) {
        $html = substr_replace($html, $meta . '</head>', $pos, strlen('</head>'));
    }

    echo $html;
    exit;
}
