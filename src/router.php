/**
 * ------------------------------------------------------------
 * Main router
 *
 * Strict protocol:
 *
 *   module=api  -> server-side JSON API (action required)
 *   u=...       -> client-side SPA route
 *   anything    -> application parameters (ignored by the router)
 * ------------------------------------------------------------
 */

$method = request_method();
$module = request_param('module');

if ($module === 'api') {
    handle_api((string) request_param('action', ''), $method);
}

/*
 * Everything else is the React SPA. The route comes from ?u= and
 * defaults to "/".
 */
$route = (string) request_param('u', '/');

if ($route === '') {
    $route = '/';
}

serve_spa($route);
