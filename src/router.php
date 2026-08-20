/**
 * ------------------------------------------------------------
 * Main router
 *
 * Strict protocol:
 *
 *   p=sifpress/api        -> server-side JSON API (action required)
 *   p=sifpress/migration  -> schema migration status / run
 *   p=sifpress/asset      -> binary asset serving
 *   p=sifpress/update     -> update check / upgrade
 *   p=sifpress/seo        -> sitemap / robots.txt
 *   p=sifpress/favicon    -> favicon serving
 *   p=sifpress/dev        -> dev-only seeder (dev builds only)
 *   p=sifpress/admin/...  -> admin SPA (React)
 *   anything else          -> viewer SPA (construction page)
 * ------------------------------------------------------------
 */

$method = request_method();
$p = request_param('p', '');

if (str_starts_with($p, 'sifpress/')) {
    $inner = substr($p, strlen('sifpress/'));

    if ($inner === 'api') {
        handle_api((string) request_param('action', ''), $method);
    }

    if ($inner === 'migration') {
        handle_migration((string) request_param('action', 'status'), $method);
    }

    if ($inner === 'asset') {
        handle_asset($method);
    }

    if ($inner === 'update') {
        handle_update((string) request_param('action', 'status'), $method);
    }

    if ($inner === 'seo') {
        handle_seo((string) request_param('action', 'robots'), $method);
    }

    if ($inner === 'favicon') {
        handle_favicon();
    }

    // ___BEGIN_DEV_ROUTE___
    if ($inner === 'dev') {
        handle_dev((string) request_param('action', 'status'), $method);
    }
    // ___END_DEV_ROUTE___

    /*
     * Admin SPA: sifpress/admin/... routes are served by the React app.
     * Strip the sifpress/ prefix so the route matches the internal path.
     */
    $route = '/' . ltrim($inner, '/');

    if ($route === '/admin') {
        header('Location: ' . base_url() . '?p=sifpress/admin/articles');
        http_response_code(302);
        exit;
    }

    serve_spa($route);
}

/*
 * Everything else is the viewer SPA (construction page for now).
 * The viewer UI will eventually live here.
 */
serve_construction_page();
