/**
 * ------------------------------------------------------------
 * Main router
 *
 * Strict protocol:
 *
 *   p=api        -> server-side JSON API (action required)
 *   p=migration  -> schema migration status / run
 *   p=/...       -> client-side SPA route (any other value, / prefixed)
 *   anything     -> application parameters (ignored by the router)
 * ------------------------------------------------------------
 */

$method = request_method();
$p = request_param('p');

if ($p === 'api') {
    handle_api((string) request_param('action', ''), $method);
}

if ($p === 'migration') {
    handle_migration((string) request_param('action', 'status'), $method);
}

if ($p === 'asset') {
    handle_asset($method);
}

if ($p === 'update') {
    handle_update((string) request_param('action', 'status'), $method);
}

if ($p === 'seo') {
    handle_seo((string) request_param('action', 'robots'), $method);
}

if ($p === 'favicon') {
    handle_favicon();
}

// ___BEGIN_DEV_ROUTE___
if ($p === 'dev') {
    handle_dev((string) request_param('action', 'status'), $method);
}
// ___END_DEV_ROUTE___

/*
 * Everything else is the React SPA. The route comes from ?p= and
 * defaults to "/".
 */
$route = (string) request_param('p', '/');

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
    header('Location: ' . base_url() . '?p=/admin/articles');
    http_response_code(302);
    exit;
}

serve_spa($route);
