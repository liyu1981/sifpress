/**
 * ------------------------------------------------------------
 * Main router
 *
 * Strict protocol (one query parameter, `p`):
 *
 *   p=sifpress/api        -> server-side JSON API (action required)
 *   p=sifpress/migration  -> schema migration status / run
 *   p=sifpress/asset      -> binary asset serving
 *   p=sifpress/sifront-bundle -> a sifront's bundle.js (from its ZIP bundle)
 *   p=sifpress/update     -> update check / upgrade
 *   p=sifpress/seo        -> sitemap / robots.txt
 *   p=sifpress/favicon    -> favicon serving
 *   p=sifpress/dev        -> dev-only seeder (dev builds only)
 *   p=sifpress/admin/...  -> admin SPA (React)
 *   p=/article/hello      -> viewer SPA (sifront), route /article/hello
 *   anything else         -> viewer SPA (construction page)
 *
 * With the rewrite rules installed (`php sifpress.php rewrite`) every `p`
 * above is also reachable as a path — /sifpress/admin/assets,
 * /article/hello-world, /robots.txt — because the path is copied into `p`.
 * request_route() resolves both forms, so neither is deprecated.
 * ------------------------------------------------------------
 */

$method = request_method();
$p = request_route();

/*
 * Conventional SEO file names. They are not module paths, so they are matched
 * on the resolved route before the sifpress/ branch below.
 */
if ($p === 'robots.txt') {
    handle_seo('robots', $method);
}

if ($p === 'sitemap.xml') {
    handle_seo('sitemap', $method);
}

if ($p === 'favicon.ico') {
    handle_favicon();
}

if (str_starts_with($p, 'sifpress/')) {
    $inner = substr($p, strlen('sifpress/'));

    if ($inner === 'api') {
        handle_api((string) request_param('action', ''), $method);
    }

    if (str_starts_with($inner, 'asset/js/') && str_ends_with($inner, '.mjs')) {
        serve_ui_sdk(substr($inner, strlen('asset/js/')));
    }

    if ($inner === 'migration') {
        handle_migration((string) request_param('action', 'status'), $method);
    }

    if ($inner === 'asset') {
        handle_asset($method);
    }

    if ($inner === 'sifront-bundle') {
        serve_sifront_bundle();
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
        header('Location: ' . route_url('sifpress/admin/sifront'));
        http_response_code(302);
        exit;
    }

    serve_spa($route);
}

/*
 * Everything else is the sifront (front-facing SPA).
 * The active sifront page is served from the DB; falls back to
 * static construction HTML when none is configured.
 */
serve_sifront_page();
