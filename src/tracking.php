/**
 * ------------------------------------------------------------
 * Tracking
 *
 * Admin-configurable analytics/tracking script injection. When
 * enabled, the appropriate <script> tag(s) are injected into the
 * document <head> for every SPA page served.
 * ------------------------------------------------------------
 */

/**
 * Resolve the tracking <script> tag(s) to inject into <head>.
 * Returns an empty string when tracking is disabled or unconfigured.
 */
function tracking_head_tags(): string
{
    if (db_needs_migration()) {
        return '';
    }

    if (setting_get('tracking_enabled', '0') !== '1') {
        return '';
    }

    $provider = setting_get('tracking_provider', '');
    $id       = setting_get('tracking_id', '');
    $custom   = setting_get('tracking_script_url', '');

    if ($id === '' && $custom === '') {
        return '';
    }

    return match ($provider) {
        'gtag'      => tracking_gtag_snippet($id, $custom),
        'plausible' => tracking_plausible_snippet($id, $custom),
        'fathom'    => tracking_fathom_snippet($id, $custom),
        'matomo'    => tracking_matomo_snippet($id, $custom),
        default     => '',
    };
}

function tracking_gtag_snippet(string $id, string $custom): string
{
    $url = $custom !== ''
        ? htmlspecialchars($custom, ENT_QUOTES | ENT_HTML5, 'UTF-8')
        : 'https://www.googletagmanager.com/gtag/js?id=' . urlencode($id);
    $id = htmlspecialchars($id, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    $config = "'{$id}'";

    if (setting_get('tracking_anonymize_ip', '1') === '1') {
        $config .= ",'{anonymize_ip':true}";
    }

    return '<script async src="' . $url . '"></script>'
        . '<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag(\'js\',new Date());gtag(\'config\',' . $config . ');</script>';
}

function tracking_plausible_snippet(string $domain, string $custom): string
{
    $src = $custom !== ''
        ? htmlspecialchars($custom, ENT_QUOTES | ENT_HTML5, 'UTF-8')
        : 'https://plausible.io/js/script.js';
    $domain = htmlspecialchars($domain, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    return '<script defer data-domain="' . $domain . '" src="' . $src . '"></script>';
}

function tracking_fathom_snippet(string $siteId, string $custom): string
{
    $src = $custom !== ''
        ? htmlspecialchars($custom, ENT_QUOTES | ENT_HTML5, 'UTF-8')
        : 'https://cdn.usefathom.com/script.js';
    $siteId = htmlspecialchars($siteId, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    return '<script src="' . $src . '" data-site="' . $siteId . '"></script>';
}

function tracking_matomo_snippet(string $id, string $custom): string
{
    $url  = '';
    $site = $id;

    if (str_contains($id, '|')) {
        [$url, $site] = explode('|', $id, 2);
    } elseif ($custom !== '') {
        $url = $custom;
    }

    if ($url === '') {
        return '';
    }

    $url  = rtrim($url, '/');
    $site = htmlspecialchars($site, ENT_QUOTES | ENT_HTML5, 'UTF-8');
    $url  = htmlspecialchars($url, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    return '<script>var _paq=window._paq||[];_paq.push([\'trackPageView\']);_paq.push([\'enableLinkTracking\']);(function(){var u="' . $url . '/";_paq.push([\'setTrackerUrl\',u+"matomo.php"]);_paq.push([\'setSiteId\',"' . $site . '"]);var d=document,g=d.createElement(\'script\'),s=d.getElementsByTagName(\'script\')[0];g.async=true;g.src=u+"matomo.js";s.parentNode.insertBefore(g,s)})();</script>';
}

function tracking_payload(): array
{
    return [
        'enabled'      => setting_get('tracking_enabled', '0'),
        'provider'     => setting_get('tracking_provider', ''),
        'id'           => setting_get('tracking_id', ''),
        'script_url'   => setting_get('tracking_script_url', ''),
        'anonymize_ip' => setting_get('tracking_anonymize_ip', '1'),
    ];
}
