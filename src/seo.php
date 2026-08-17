/**
 * ------------------------------------------------------------
 * SEO
 *
 * Site-wide settings (key/value), per-page SEO resolution from
 * front matter, server-side <head> meta injection for the SPA,
 * and the ?module=seo sitemap/robots endpoints.
 * ------------------------------------------------------------
 */

/**
 * Read a site setting (empty default when absent). Cached per request;
 * missing table (pre-migration) degrades to defaults instead of crashing.
 */
function setting_get(string $key, ?string $default = null): ?string
{
    static $cache = null;

    if ($cache === null) {
        $cache = [];

        try {
            $rows = db()->query('SELECT key, value FROM settings');
            foreach ($rows->fetchAll() as $row) {
                $cache[$row['key']] = $row['value'];
            }
        } catch (Throwable $e) {
            $cache = [];
        }
    }

    return array_key_exists($key, $cache) ? $cache[$key] : $default;
}

/**
 * Upsert a site setting (created/updated timestamps tracked).
 */
function setting_set(string $key, string $value): void
{
    db()->prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value,
                                        updated_at = datetime(\'now\')'
    )->execute([$key, $value]);
}

/**
 * The public SEO settings payload (no secrets live here).
 */
function settings_payload(): array
{
    return [
        'site_name' => setting_get('site_name', APP_NAME),
        'site_description' => setting_get('site_description', ''),
        'site_url' => setting_get('site_url', ''),
        'default_og_image' => setting_get('default_og_image', ''),
        'twitter_handle' => setting_get('twitter_handle', ''),
        'enable_sitemap' => setting_get('enable_sitemap', '1'),
        'robots_content' => setting_get('robots_content', ''),
    ];
}

/**
 * Scalar read of a single front-matter key. Returns the trimmed value with
 * surrounding quotes stripped, or null when the key is absent/empty/array.
 */
function front_matter_value(string $content, string $key): ?string
{
    if (!preg_match('/^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)/s', $content, $match)) {
        return null;
    }

    $pattern = '/^' . preg_quote($key, '/') . '[ \t]*:[ \t]*(.*)$/i';

    foreach (preg_split('/\r?\n/', $match[1]) as $line) {
        $line = trim($line);

        if (!preg_match($pattern, $line, $m)) {
            continue;
        }

        $value = trim($m[1]);

        if ($value === '' || str_starts_with($value, '[')) {
            continue;
        }

        $value = trim(preg_split('/[ \t]+#/', $value, 2)[0]);

        if ($value === '') {
            continue;
        }

        if ((str_starts_with($value, '"') && str_ends_with($value, '"'))
            || (str_starts_with($value, "'") && str_ends_with($value, "'"))) {
            $value = substr($value, 1, -1);
        }

        return $value;
    }

    return null;
}

/**
 * Whether a front-matter key holds a truthy value.
 */
function front_matter_bool(string $content, string $key): bool
{
    $value = front_matter_value($content, $key);

    return $value !== null && in_array(strtolower($value), ['1', 'true', 'yes', 'on'], true);
}

/**
 * Plain-text teaser from markdown body (~155 chars), matching the client's
 * excerptFromMarkdown() so server and client agree.
 */
function excerpt_from_markdown(string $markdown, int $max = 155): string
{
    $content = (string) preg_replace(
        '/^---[ \t]*\r?\n.*?\r?\n---[ \t]*(?:\r?\n|$)/s',
        '',
        $markdown,
        1
    );

    $plain = $content;
    $plain = (string) preg_replace('/!\[[^\]]*\]\([^)]*\)/', ' ', $plain);
    $plain = (string) preg_replace('/```[\s\S]*?```/', ' ', $plain);
    $plain = (string) preg_replace('/^\s{0,3}#{1,6}\s+/m', ' ', $plain);
    $plain = (string) preg_replace('/[`*_>~|#\-\[\]()]/', ' ', $plain);
    $plain = (string) preg_replace('/\s+/', ' ', $plain);
    $plain = trim($plain);

    if (mb_strlen($plain) <= $max) {
        return $plain;
    }

    return trim(mb_substr($plain, 0, $max)) . '…';
}

/**
 * The canonical base: the configured site_url, else derived from the
 * request (scheme + host + script name), so the rewrite-free artifact
 * works at any mount depth.
 */
function base_url(): string
{
    $configured = setting_get('site_url', '');

    if ($configured !== '') {
        return rtrim($configured, '/');
    }

    $scheme = is_https() ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost'));
    $script = (string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php');

    return $scheme . '://' . $host . $script;
}

/**
 * Absolute canonical URL for a route. Root maps to the base; everything
 * else is the query-string form the router actually serves.
 */
function canonical_url(string $route): string
{
    $route = trim($route, '/');

    if ($route === '') {
        return base_url();
    }

    return base_url() . '?u=' . $route;
}

/**
 * Resolve a possibly-relative URL (e.g. `?module=asset&id=5` og:image)
 * to an absolute one for social scrapers.
 */
function absolute_url(string $url): string
{
    $url = trim($url);

    if ($url === '' || preg_match('/^[a-z][a-z0-9+.-]*:/i', $url)) {
        return $url;
    }

    $scheme = is_https() ? 'https' : 'http';
    $host = (string) ($_SERVER['HTTP_HOST'] ?? ($_SERVER['SERVER_NAME'] ?? 'localhost'));

    if (str_starts_with($url, '//')) {
        return $scheme . ':' . $url;
    }

    $origin = $scheme . '://' . $host;

    if (str_starts_with($url, '/')) {
        return $origin . $url;
    }

    $dir = rtrim(dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/\\');

    return $origin . $dir . '/' . $url;
}

/**
 * HTML-escape a value for injection into <head>.
 */
function seo_esc(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/**
 * Resolved SEO payload for a page, applying the documented fallback chains.
 */
function page_seo(array $page): array
{
    $content = (string) $page['content_md'];
    $siteName = setting_get('site_name', APP_NAME);
    $suffix = $siteName !== '' ? ' — ' . $siteName : '';

    $seoTitle = front_matter_value($content, 'seo_title');

    $title = ($seoTitle !== null && $seoTitle !== '')
        ? $seoTitle . $suffix
        : ((string) $page['title'] . $suffix);

    $description = front_matter_value($content, 'description');

    if ($description === null || $description === '') {
        $description = excerpt_from_markdown($content);
    }

    if ($description === '') {
        $description = setting_get('site_description', '') ?? '';
    }

    $ogImage = front_matter_value($content, 'og_image');

    if ($ogImage === null || $ogImage === '') {
        $ogImage = front_matter_value($content, 'cover');
    }

    if ($ogImage === null || $ogImage === '') {
        $ogImage = setting_get('default_og_image', '') ?? '';
    }

    $ogImage = absolute_url((string) $ogImage);

    $canonical = front_matter_value($content, 'canonical');

    if ($canonical === null || $canonical === '') {
        $canonical = canonical_url('/article/' . $page['slug']);
    }

    $keywords = front_matter_value($content, 'keywords');

    return [
        'title' => $title,
        'description' => $description,
        'og_image' => $ogImage,
        'canonical' => $canonical,
        'noindex' => front_matter_bool($content, 'noindex'),
        'keywords' => $keywords === null ? '' : $keywords,
    ];
}

/**
 * The <head> meta block for the given SPA route ('' when the DB is not
 * migrated yet). Article routes resolve the page; everything else falls
 * back to site defaults, with private routes marked noindex.
 */
function seo_meta_tags(string $route): string
{
    if (db_needs_migration()) {
        return '';
    }

    $route = '/' . ltrim($route, '/');

    $siteName = setting_get('site_name', APP_NAME);
    $siteDescription = setting_get('site_description', '') ?? '';
    $twitterHandle = setting_get('twitter_handle', '') ?? '';

    $private = false;

    foreach (['/editor', '/settings', '/assets', '/login'] as $prefix) {
        if ($route === $prefix || str_starts_with($route, $prefix . '/')) {
            $private = true;
            break;
        }
    }

    if (preg_match('#^/article/([a-z0-9]+(?:-[a-z0-9]+)*)$#', $route, $m)) {
        $page = fetch_page(0, $m[1]);

        if ($page === null && $m[1] === DEMO_PAGE_SLUG) {
            $page = demo_page_payload();
        }

        if ($page !== null
            && $page['status'] === 'published'
            && can_view_page(null, $page)) {
            return build_article_meta($page, $siteName, $twitterHandle);
        }

        $tags = ['<meta name="robots" content="noindex,nofollow">'];
        $tags[] = '<title>' . seo_esc($siteName) . '</title>';
        $tags[] = '<link rel="canonical" href="' . seo_esc(canonical_url($route)) . '">';

        if ($siteDescription !== '') {
            $tags[] = '<meta name="description" content="' . seo_esc($siteDescription) . '">';
        }

        return implode("\n    ", $tags) . "\n    ";
    }

    $tags = ['<title>' . seo_esc($siteName) . '</title>'];

    if ($siteDescription !== '') {
        $tags[] = '<meta name="description" content="' . seo_esc($siteDescription) . '">';
    }

    $tags[] = '<link rel="canonical" href="' . seo_esc(canonical_url($route)) . '">';

    if ($private) {
        $tags[] = '<meta name="robots" content="noindex,nofollow">';
    }

    return implode("\n    ", $tags) . "\n    ";
}

/**
 * Full article meta: title, description, OG, Twitter, canonical, JSON-LD.
 */
function build_article_meta(array $page, string $siteName, string $twitterHandle): string
{
    $seo = page_seo($page);
    $siteName = $siteName !== '' ? $siteName : APP_NAME;

    $meta = [];

    $meta[] = '<title>' . seo_esc($seo['title']) . '</title>';
    $meta[] = '<meta name="description" content="' . seo_esc($seo['description']) . '">';

    if ($seo['keywords'] !== '') {
        $meta[] = '<meta name="keywords" content="' . seo_esc($seo['keywords']) . '">';
    }

    if ($seo['noindex']) {
        $meta[] = '<meta name="robots" content="noindex,nofollow">';
    }

    $meta[] = '<link rel="canonical" href="' . seo_esc($seo['canonical']) . '">';

    $meta[] = '<meta property="og:type" content="article">';
    $meta[] = '<meta property="og:site_name" content="' . seo_esc($siteName) . '">';
    $meta[] = '<meta property="og:title" content="' . seo_esc($seo['title']) . '">';
    $meta[] = '<meta property="og:description" content="' . seo_esc($seo['description']) . '">';
    $meta[] = '<meta property="og:url" content="' . seo_esc($seo['canonical']) . '">';

    if ($seo['og_image'] !== '') {
        $meta[] = '<meta property="og:image" content="' . seo_esc($seo['og_image']) . '">';
    }

    $meta[] = '<meta name="twitter:card" content="' .
        ($seo['og_image'] !== '' ? 'summary_large_image' : 'summary') . '">';
    $meta[] = '<meta name="twitter:title" content="' . seo_esc($seo['title']) . '">';
    $meta[] = '<meta name="twitter:description" content="' . seo_esc($seo['description']) . '">';

    if ($seo['og_image'] !== '') {
        $meta[] = '<meta name="twitter:image" content="' . seo_esc($seo['og_image']) . '">';
    }

    if ($twitterHandle !== '') {
        $meta[] = '<meta name="twitter:site" content="@' . seo_esc(ltrim($twitterHandle, '@')) . '">';
    }

    $ld = [
        '@context' => 'https://schema.org',
        '@type' => 'Article',
        'headline' => (string) $page['title'],
        'description' => $seo['description'],
        'datePublished' => (string) $page['created_at'],
        'dateModified' => (string) $page['updated_at'],
        'author' => [
            '@type' => 'Person',
            'name' => (string) $page['created_by_name'],
        ],
        'url' => $seo['canonical'],
        'mainEntityOfPage' => $seo['canonical'],
    ];

    if ($seo['og_image'] !== '') {
        $ld['image'] = $seo['og_image'];
    }

    $meta[] = '<script type="application/ld+json">' .
        json_encode($ld, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) .
        '</script>';

    return implode("\n    ", $meta) . "\n    ";
}

/**
 * ?module=seo handler: XML sitemap + plain-text robots.txt. Public.
 */
function handle_seo(string $action, string $method): never
{
    if ($method !== 'GET') {
        http_response_code(405);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-cache');
        header('X-Content-Type-Options: nosniff');
        echo 'Method not allowed';
        exit;
    }

    if (db_needs_migration()) {
        http_response_code(503);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-cache');
        header('X-Content-Type-Options: nosniff');
        echo 'Service unavailable';
        exit;
    }

    switch ($action) {
        case 'sitemap':
            seo_sitemap();
        case 'robots':
            seo_robots();
        default:
            http_response_code(404);
            header('Content-Type: text/plain; charset=utf-8');
            header('Cache-Control: no-cache');
            header('X-Content-Type-Options: nosniff');
            echo 'Not found';
            exit;
    }
}

/**
 * XML sitemap of the home page + every published, guest-visible page.
 */
function seo_sitemap(): never
{
    if (setting_get('enable_sitemap', '1') !== '1') {
        http_response_code(404);
        header('Content-Type: application/xml; charset=utf-8');
        header('Cache-Control: no-cache');
        header('X-Content-Type-Options: nosniff');
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n<!-- sitemap disabled -->\n";
        exit;
    }

    $pages = db()->query(
        "SELECT p.id, p.slug, p.title, p.status, p.created_by, p.updated_at
           FROM pages p
          WHERE p.status = 'published'
          ORDER BY p.updated_at DESC"
    )->fetchAll();

    $urls = ['<url><loc>' . seo_esc(canonical_url('/')) . '</loc></url>'];

    foreach ($pages as $page) {
        if (!can_view_page(null, $page)) {
            continue;
        }

        $urls[] = '<url><loc>' . seo_esc(canonical_url('/article/' . $page['slug'])) . '</loc>' .
            '<lastmod>' . seo_esc(substr((string) $page['updated_at'], 0, 10)) . '</lastmod></url>';
    }

    http_response_code(200);
    header('Content-Type: application/xml; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');

    echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
    echo implode("\n", $urls) . "\n";
    echo '</urlset>' . "\n";
    exit;
}

/**
 * robots.txt. Custom content when configured; otherwise a built-in
 * default that blocks the private SPA routes. The Sitemap line is
 * appended when the sitemap is enabled.
 */
function seo_robots(): never
{
    $custom = setting_get('robots_content', '') ?? '';

    if ($custom !== '') {
        $body = $custom;
    } else {
        $body = "User-agent: *\n"
            . "Allow: /\n"
            . "Disallow: /?u=editor\n"
            . "Disallow: /?u=settings\n"
            . "Disallow: /?u=login";
    }

    if (setting_get('enable_sitemap', '1') === '1' && !str_contains($body, 'Sitemap:')) {
        $body .= "\nSitemap: " . canonical_url('/') . '?module=seo&action=sitemap';
    }

    http_response_code(200);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-cache');
    header('X-Content-Type-Options: nosniff');

    echo $body . "\n";
    exit;
}