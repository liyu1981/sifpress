/**
 * ------------------------------------------------------------
 * Main router
 *
 * Strict protocol:
 *
 *   module=api        -> server-side JSON API (action required)
 *   module=migration  -> schema migration status / run
 *   u=...             -> client-side SPA route
 *   anything          -> application parameters (ignored by the router)
 * ------------------------------------------------------------
 */

$method = request_method();
$module = request_param('module');

if ($module === 'api') {
    handle_api((string) request_param('action', ''), $method);
}

if ($module === 'migration') {
    handle_migration((string) request_param('action', 'status'), $method);
}

if ($module === 'asset') {
    handle_asset($method);
}

if ($module === 'update') {
    handle_update((string) request_param('action', 'status'), $method);
}

if ($module === 'seo') {
    handle_seo((string) request_param('action', 'robots'), $method);
}

if ($module === 'favicon') {
    handle_favicon();
}

// ___BEGIN_DEV_ROUTE___
if ($module === 'dev') {
    handle_dev((string) request_param('action', 'status'), $method);
}
// ___END_DEV_ROUTE___

/*
 * Everything else is the React SPA. The route comes from ?u= and
 * defaults to "/".
 */
$route = (string) request_param('u', '/');

if ($route === '') {
    $route = '/';
}

if (!str_starts_with($route, '/')) {
    $route = '/' . $route;
}

/*
 * Root "/" serves a static "under construction" page.
 * The viewer UI will eventually live here.
 */
if ($route === '/') {
    serve_construction_page();
}

/*
 * Bare "/admin" redirects into the admin SPA at "/admin/articles".
 */
if ($route === '/admin') {
    header('Location: ' . base_url() . '?u=/admin/articles');
    http_response_code(302);
    exit;
}

serve_spa($route);
