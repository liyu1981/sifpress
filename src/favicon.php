/**
 * ------------------------------------------------------------
 * Favicon
 *
 * Serves the site favicon. When a custom favicon asset is
 * configured, redirects to ?module=asset&id=N (reusing its
 * ETag caching and auth checks). Otherwise serves an inline
 * SVG fallback.
 * ------------------------------------------------------------
 */

const DEFAULT_FAVICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180">'
    . '<rect width="180" height="180" rx="40" fill="#6366f1"/>'
    . '<text x="90" y="90" font-family="-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif" '
    . 'font-size="110" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">S</text></svg>';

function handle_favicon(): never
{
    header('Cache-Control: public, max-age=86400');
    header('X-Content-Type-Options: nosniff');

    $faviconId = (string) setting_get('favicon_asset_id', '');

    if ($faviconId !== '' && $faviconId !== '0') {
        $version = (string) setting_get('favicon_version', '0');
        $url = '?module=asset&id=' . $faviconId . '&v=' . $version;
        header('Location: ' . $url, true, 302);
        exit;
    }

    header('Content-Type: image/svg+xml');
    echo DEFAULT_FAVICON_SVG;
    exit;
}
