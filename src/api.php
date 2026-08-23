/**
 * ------------------------------------------------------------
 * API
 *
 * Protocol:
 *   ?p=sifpress/api&action=auth.login
 *   ?p=sifpress/api&action=pages.list
 *   ...
 *
 * Dotted action names; GET = read, POST = create, PATCH = partial
 * update, DELETE = delete. JSON bodies via read_json_body().
 * ------------------------------------------------------------
 */

/* ------------------------------------------------------------------ */
/* Validation helpers                                                 */
/* ------------------------------------------------------------------ */

function validate_slug(string $slug): array
{
    if ($slug === '' || mb_strlen($slug) > 64) {
        return ['must be 1-64 characters'];
    }

    if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) {
        return ['only lowercase letters, digits, and single hyphens'];
    }

    return [];
}

function validate_username(string $username): array
{
    if (mb_strlen($username) < 3 || mb_strlen($username) > 32) {
        return ['must be 3-32 characters'];
    }

    if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9._-]*$/', $username)) {
        return ['letters, digits, dots, dashes, underscores; must start alphanumeric'];
    }

    return [];
}

function validate_password(string $password): array
{
    if (strlen($password) < 8) {
        return ['must be at least 8 characters'];
    }

    if (!preg_match('/[A-Za-z]/', $password) || !preg_match('/[0-9]/', $password)) {
        return ['must contain at least one letter and one digit'];
    }

    return [];
}

/**
 * Normalize a client datetime into 'YYYY-MM-DD HH:MM:SS' for storage.
 * Accepts the HTML datetime-local 'T' separator and an optional
 * seconds part. Returns '' for missing or invalid input.
 */
function normalize_datetime(mixed $value): string
{
    if (!is_string($value) || trim($value) === '') {
        return '';
    }

    $value = str_replace('T', ' ', trim($value));

    if (!preg_match('/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})(?::(\d{2}))?$/', $value, $m)) {
        return '';
    }

    if (!checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        return '';
    }

    return sprintf(
        '%04d-%02d-%02d %02d:%02d:%02d',
        (int) $m[1],
        (int) $m[2],
        (int) $m[3],
        (int) $m[4],
        (int) $m[5],
        (int) ($m[6] ?? '00')
    );
}

/* ------------------------------------------------------------------ */
/* Page helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetch a page row joined with author display names, by id or slug.
 */
function fetch_page(int $id, ?string $slug = null): ?array
{
    $sql = 'SELECT p.*, cu.name AS created_by_name, uu.name AS updated_by_name
              FROM pages p
              LEFT JOIN users cu ON cu.id = p.created_by
              LEFT JOIN users uu ON uu.id = p.updated_by
             WHERE ';

    if ($slug !== null) {
        $stmt = db()->prepare($sql . 'p.slug = ?');
        $stmt->execute([$slug]);
    } else {
        $stmt = db()->prepare($sql . 'p.id = ?');
        $stmt->execute([$id]);
    }

    $row = $stmt->fetch();

    return $row === false ? null : $row;
}

/**
 * SQL clause (with named params) that restricts a pages query to rows the
 * current user may view: the owner, anyone the user has a grant on the
 * page for, and any page carrying a _guest_ grant (i.e. public). Admins
 * see everything. Returns an empty clause for admins.
 */
function view_filter_sql(): array
{
    $user = current_user();

    if ($user !== null && is_admin($user)) {
        return ['clause' => '', 'params' => []];
    }

    $uid = $user !== null ? (int) $user['id'] : -1;
    $guestId = guest_user_id();
    $ids = $guestId !== null ? [$guestId] : [];

    if ($uid > 0) {
        $ids[] = $uid;
    }

    $ids = array_values(array_unique($ids));
    $inParams = [];

    foreach ($ids as $i => $id) {
        $inParams[':vf' . $i] = $id;
    }

    $placeholders = implode(',', array_keys($inParams));
    $clause = '(p.created_by = :vfu OR EXISTS (
        SELECT 1 FROM page_grants vg
         WHERE vg.page_id = p.id AND vg.user_id IN (' . $placeholders . ')
    ))';

    return [
        'clause' => $clause,
        'params' => array_merge([':vfu' => $uid], $inParams),
    ];
}

/**
 * Give the _guest_ user a view grant on a page (the default for newly
 * created pages). No-op when the guest user is not seeded yet.
 */
function grant_default_guest_view(int $pageId, int $grantedBy): void
{
    $guestId = guest_user_id();

    if ($guestId === null) {
        return;
    }

    db()->prepare(
        'INSERT OR IGNORE INTO page_grants (page_id, user_id, granted_by, permission)
         VALUES (?, ?, ?, ?)'
    )->execute([$pageId, $guestId, $grantedBy, 'view']);
}

/**
 * Parse the `tags:` list out of a page's YAML front matter. Mirrors the
 * subset parsed on the client (lib/front-matter.ts): an inline array
 * `[a, b]` or a comma/space separated list, quoted items supported.
 * Returns a deduplicated list of non-empty tag strings.
 */
function front_matter_tags(string $content): array
{
    if (!preg_match('/^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*(?:\r?\n|$)/s', $content, $match)) {
        return [];
    }

    foreach (preg_split('/\r?\n/', $match[1]) as $line) {
        $line = trim($line);

        if (!preg_match('/^tags[ \t]*:[ \t]*(.*)$/i', $line, $m)) {
            continue;
        }

        $value = trim($m[1]);
        $value = preg_split('/[ \t]+#/', $value, 2)[0];
        $tags = [];

        if (str_starts_with($value, '[') && str_ends_with($value, ']')) {
            foreach (explode(',', substr($value, 1, -1)) as $item) {
                $item = trim(trim($item), "\"'");
                if ($item !== '') {
                    $tags[] = $item;
                }
            }
        } elseif ($value !== '') {
            foreach (preg_split('/[,\s]+/', $value) as $item) {
                $item = trim(trim($item), "\"'");
                if ($item !== '') {
                    $tags[] = $item;
                }
            }
        }

        return array_values(array_unique($tags));
    }

    return [];
}

/**
 * Public page payload; can_edit reflects the current user's rights.
 */
function page_payload(array $page): array
{
    $user = current_user();

    return [
        'id' => (int) $page['id'],
        'slug' => $page['slug'],
        'title' => $page['title'],
        'content_md' => $page['content_md'],
        'tags' => front_matter_tags($page['content_md']),
        'status' => $page['status'],
        'created_by' => $page['created_by'] !== null ? (int) $page['created_by'] : null,
        'created_by_name' => (string) $page['created_by_name'],
        'updated_by' => $page['updated_by'] !== null ? (int) $page['updated_by'] : null,
        'updated_by_name' => (string) $page['updated_by_name'],
        'created_at' => $page['created_at'],
        'updated_at' => $page['updated_at'],
        'can_edit' => $user !== null && can_edit_page($user, (int) $page['id']),
        'seo' => page_seo($page),
    ];
}

/**
 * FTS5 search over pages. Returns a page_payload-shaped list with an
 * excerpt, or an empty list for short/empty queries.
 */
function search_pages(string $q, ?string $status): array
{
    $match = build_match($q);

    if ($match === '') {
        return ['items' => [], 'total' => 0];
    }

    $sql = 'SELECT p.id, p.slug, p.title, p.status, p.created_by, p.updated_by,
                   p.created_at, p.updated_at, cu.name AS created_by_name,
                   uu.name AS updated_by_name,
                   snippet(pages_fts, 1, \'<mark>\', \'</mark>\', \'…\', 12) AS excerpt
              FROM pages_fts
              JOIN pages p ON p.id = pages_fts.rowid
              LEFT JOIN users cu ON cu.id = p.created_by
              LEFT JOIN users uu ON uu.id = p.updated_by
             WHERE pages_fts MATCH :match';

    $params = ['match' => $match];

    if ($status !== null) {
        $sql .= ' AND p.status = :status';
        $params['status'] = $status;
    }

    $view = view_filter_sql();

    if ($view['clause'] !== '') {
        $sql .= ' AND ' . $view['clause'];
        $params = array_merge($params, $view['params']);
    }

    $sql .= ' ORDER BY rank LIMIT 50';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    $rows = $stmt->fetchAll();
    $user = current_user();

    $items = array_map(static function (array $page) use ($user): array {
        return [
            'id' => (int) $page['id'],
            'slug' => $page['slug'],
            'title' => $page['title'],
            'excerpt' => (string) $page['excerpt'],
            'status' => $page['status'],
            'created_by_name' => (string) $page['created_by_name'],
            'updated_at' => $page['updated_at'],
            'can_edit' => $user !== null && can_edit_page($user, (int) $page['id']),
        ];
    }, $rows);

    return ['items' => $items, 'total' => count($items)];
}

/* ------------------------------------------------------------------ */
/* Action handlers                                                    */
/* ------------------------------------------------------------------ */

function api_auth_login(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $body = read_json_body();
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');

    if ($username === '' || $password === '') {
        json_response(['error' => 'username and password are required'], 422);
    }

    /*
     * Username or email both sign in; the address can be used as the
     * login credential. Collisions between the two namespaces are
     * prevented at create/update time.
     */
    $stmt = db()->prepare(
        'SELECT * FROM users WHERE (username = :u OR email = :u) AND is_active = 1'
    );
    $stmt->execute(['u' => $username]);
    $row = $stmt->fetch();

    if ($row === false
        || $row['username'] === '_guest_'
        || !password_verify($password, $row['password_hash'])) {
        json_response(['error' => 'invalid credentials'], 401);
    }

    create_session((int) $row['id']);
    json_response(['user' => user_payload((int) $row['id'])]);
}

function api_auth_logout(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_auth();
    destroy_session();
    json_response(['ok' => true]);
}

function api_auth_me(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $user = current_user();
    json_response(['user' => $user === null ? null : user_payload((int) $user['id'])]);
}

function api_auth_change_password(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $user = require_auth();
    $body = read_json_body();
    $newPassword = (string) ($body['new_password'] ?? '');

    $errors = validate_password($newPassword);

    if ($errors !== []) {
        json_response([
            'error' => 'validation failed',
            'errors' => ['new_password' => $errors],
        ], 422);
    }

    if (!$user['must_change_password']) {
        $currentPassword = (string) ($body['current_password'] ?? '');
        $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
        $stmt->execute([$user['id']]);
        $hash = $stmt->fetchColumn();

        if ($hash === false || !password_verify($currentPassword, $hash)) {
            json_response(['error' => 'current password is incorrect'], 422);
        }
    }

    $stmt = db()->prepare(
        'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime(\'now\')
          WHERE id = ?'
    );
    $stmt->execute([password_hash($newPassword, PASSWORD_DEFAULT), $user['id']]);

    json_response(['ok' => true]);
}

/**
 * Self-service profile edit: display name and/or email. Only the current
 * user's own row; email may be cleared (null) and doubles as a login
 * credential, so collisions against other usernames/emails are rejected.
 */
function api_auth_profile(string $method): never
{
    if ($method !== 'PATCH') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $user = require_auth();
    $body = read_json_body();

    $sets = [];
    $params = [];
    $errors = [];

    if (array_key_exists('name', $body)) {
        $name = trim((string) $body['name']);

        if ($name === '') {
            $errors['name'] = ['required'];
        } elseif (mb_strlen($name) > 100) {
            $errors['name'] = ['must be at most 100 characters'];
        } else {
            $sets[] = 'name = :name';
            $params['name'] = $name;
        }
    }

    if (array_key_exists('email', $body)) {
        $email = $body['email'] === '' || $body['email'] === null
            ? null
            : trim((string) $body['email']);

        if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = ['invalid email'];
        } elseif ($email !== $user['email'] && email_in_use($email, (int) $user['id'])) {
            $errors['email'] = ['already in use'];
        } elseif ($email !== $user['email']) {
            $sets[] = 'email = :email';
            $params['email'] = $email;
        }
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    if ($sets !== []) {
        $sets[] = 'updated_at = datetime(\'now\')';
        $params['id'] = $user['id'];
        db()->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = :id')
            ->execute($params);
    }

    json_response(['user' => user_payload((int) $user['id'])]);
}

/**
 * Avatar management for the current user.
 *
 *   POST   multipart ?p=sifpress/api&action=auth.avatar  (field: avatar)
 *   DELETE ?p=sifpress/api&action=auth.avatar            clears the avatar
 *
 * The image is validated by magic bytes (raster images only; SVG is
 * rejected) and capped at ASSET_MAX_AVATAR_BYTES. Clients downscale to a
 * small square before upload, so blobs stay tiny.
 */
function api_auth_avatar(string $method): never
{
    $user = require_auth();

    if ($method === 'DELETE') {
        db()->prepare(
            'UPDATE users SET avatar = NULL, avatar_mime = NULL, updated_at = datetime(\'now\')
              WHERE id = ?'
        )->execute([$user['id']]);

        json_response(['user' => user_payload((int) $user['id'])]);
    }

    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    if (!isset($_FILES['avatar']) || $_FILES['avatar']['error'] === UPLOAD_ERR_NO_FILE) {
        json_response(['error' => 'avatar is required'], 422);
    }

    $file = $_FILES['avatar'];

    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
        json_response(['error' => 'avatar too large'], 413);
    }

    if ($file['error'] !== UPLOAD_ERR_OK) {
        json_response(['error' => 'upload failed'], 400);
    }

    if ((int) filesize($file['tmp_name']) > ASSET_MAX_AVATAR_BYTES) {
        json_response([
            'error' => 'avatar too large',
            'max_bytes' => ASSET_MAX_AVATAR_BYTES,
        ], 413);
    }

    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo !== false ? (string) finfo_file($finfo, $file['tmp_name']) : '';
    if ($finfo !== false) {
        finfo_close($finfo);
    }

    if (!str_starts_with($mime, 'image/') || $mime === 'image/svg+xml') {
        json_response(['error' => 'unsupported image type'], 415);
    }

    $stmt = db()->prepare(
        'UPDATE users SET avatar = ?, avatar_mime = ?, updated_at = datetime(\'now\') WHERE id = ?'
    );
    $stmt->bindValue(1, file_get_contents($file['tmp_name']), PDO::PARAM_LOB);
    $stmt->bindValue(2, $mime);
    $stmt->bindValue(3, $user['id'], PDO::PARAM_INT);
    $stmt->execute();

    json_response(['user' => user_payload((int) $user['id'])]);
}

function api_system_status(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $v = db_version();

    json_response([
        'name' => APP_NAME,
        'api' => true,
        'migrate_required' => $v['applied'] !== $v['latest'],
        'version' => $v['applied'],
        'latest' => $v['latest'],
        'asset_limits' => [
            'image_max_bytes' => asset_effective_cap('image'),
            'video_max_bytes' => asset_effective_cap('video'),
            'thumb_max_bytes' => ASSET_THUMB_MAX_BYTES,
        ],
    ]);
}

function api_settings_get(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    json_response(['settings' => settings_payload()]);
}

function api_tracking_get(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    json_response(['tracking' => tracking_payload()]);
}

function api_tracking_update(string $method): never
{
    if ($method !== 'PATCH') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('settings.manage');

    $body = read_json_body();
    $rules = [
        'enabled'      => ['enum' => ['0', '1']],
        'provider'     => ['enum' => ['gtag', 'plausible', 'fathom', 'matomo', ''], 'max' => 32],
        'id'           => ['max' => 200],
        'script_url'   => ['max' => 500, 'url' => true],
        'anonymize_ip' => ['enum' => ['0', '1']],
    ];

    $sets = [];
    $errors = [];

    foreach ($rules as $key => $rule) {
        if (!array_key_exists($key, $body)) {
            continue;
        }

        $value = trim((string) $body[$key]);

        if (isset($rule['enum']) && !in_array($value, $rule['enum'], true)) {
            $errors[$key] = ['must be ' . implode(' or ', $rule['enum'])];
            continue;
        }

        if (isset($rule['url']) && $value !== '' && !filter_var($value, FILTER_VALIDATE_URL)) {
            $errors[$key] = ['invalid URL'];
            continue;
        }

        if (isset($rule['max']) && mb_strlen($value) > $rule['max']) {
            $errors[$key] = ['must be at most ' . $rule['max'] . ' characters'];
            continue;
        }

        $sets[$key] = $value;
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    foreach ($sets as $key => $value) {
        setting_set($key, $value);
    }

    json_response(['ok' => true]);
}

function api_settings_update(string $method): never
{
    if ($method !== 'PATCH') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('settings.manage');

    $body = read_json_body();
    $rules = [
        'site_name' => ['max' => 100],
        'site_description' => ['max' => 200],
        'site_url' => ['max' => 300, 'url' => true],
        'default_og_image' => ['max' => 300, 'url' => true],
        'twitter_handle' => ['max' => 32, 'handle' => true],
        'enable_sitemap' => ['enum' => ['0', '1']],
        'robots_content' => ['max' => 2000],
        'favicon_asset_id' => ['max' => 20],
        'apple_touch_icon_asset_id' => ['max' => 20],
        'active_sifront_id' => ['max' => 20],
    ];

    $sets = [];
    $errors = [];

    foreach ($rules as $key => $rule) {
        if (!array_key_exists($key, $body)) {
            continue;
        }

        $value = trim((string) $body[$key]);

        if (isset($rule['enum']) && !in_array($value, $rule['enum'], true)) {
            $errors[$key] = ['must be ' . implode(' or ', $rule['enum'])];
            continue;
        }

        if (isset($rule['handle']) && $value !== ''
            && !preg_match('/^@?[A-Za-z0-9_]{1,15}$/', $value)) {
            $errors[$key] = ['must be a Twitter handle (@name, letters/digits/underscore)'];
            continue;
        }

        if (isset($rule['url']) && $value !== '' && !filter_var($value, FILTER_VALIDATE_URL)) {
            $errors[$key] = ['invalid URL'];
            continue;
        }

        if (isset($rule['max']) && mb_strlen($value) > $rule['max']) {
            $errors[$key] = ['must be at most ' . $rule['max'] . ' characters'];
            continue;
        }

        $sets[$key] = $value;
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    foreach ($sets as $key => $value) {
        setting_set($key, $value);
    }

    if (isset($sets['favicon_asset_id']) || isset($sets['apple_touch_icon_asset_id'])) {
        $current = (string) setting_get('favicon_version', '0');
        setting_set('favicon_version', (string) ((int) $current + 1));
    }

    if (isset($sets['favicon_asset_id'])) {
        $favId = (int) $sets['favicon_asset_id'];
        if ($favId > 0) {
            $favRow = db()->query('SELECT mime FROM assets WHERE id = ' . $favId)->fetch();
            if ($favRow !== false) {
                setting_set('favicon_mime', (string) $favRow['mime']);
            }
        } else {
            setting_set('favicon_mime', 'image/svg+xml');
        }
    }

    json_response(['ok' => true]);
}

function api_pages_list(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $q = request_param('q');

    if ($q !== null && trim($q) !== '') {
        json_response(search_pages(trim($q), api_status_param()));
    }

    $status = api_status_param();
    $page = max(1, (int) request_param('page', '1'));
    $perPage = min(100, max(1, (int) request_param('per_page', '20')));
    $tag = request_param('tag');

    $view = view_filter_sql();
    $whereParts = [];
    $params = [];

    if ($status !== null) {
        $whereParts[] = 'p.status = :status';
        $params['status'] = $status;
    }

    if ($view['clause'] !== '') {
        $whereParts[] = $view['clause'];
    }

    $where = $whereParts === [] ? '' : 'WHERE ' . implode(' AND ', $whereParts);
    $params = array_merge($params, $view['params']);

    if ($tag !== null && trim($tag) !== '') {
        $tag = trim($tag);

        $stmt = db()->prepare(
            'SELECT p.*, cu.name AS created_by_name, uu.name AS updated_by_name
               FROM pages p
               LEFT JOIN users cu ON cu.id = p.created_by
               LEFT JOIN users uu ON uu.id = p.updated_by
               ' . $where . '
              ORDER BY p.updated_at DESC'
        );
        $stmt->execute($params);

        $filtered = array_values(array_filter(
            $stmt->fetchAll(),
            static fn (array $row): bool => in_array(
                $tag,
                front_matter_tags($row['content_md']),
                true
            )
        ));

        json_response([
            'items' => array_map(
                static fn (array $row): array => page_payload($row),
                array_slice($filtered, ($page - 1) * $perPage, $perPage)
            ),
            'total' => count($filtered),
            'page' => $page,
            'per_page' => $perPage,
        ]);
    }

    $stmt = db()->prepare('SELECT COUNT(*) FROM pages p ' . $where);
    $stmt->execute($params);
    $total = (int) $stmt->fetchColumn();

    $sql = 'SELECT p.*, cu.name AS created_by_name, uu.name AS updated_by_name
              FROM pages p
              LEFT JOIN users cu ON cu.id = p.created_by
              LEFT JOIN users uu ON uu.id = p.updated_by
              ' . $where . '
             ORDER BY p.updated_at DESC
             LIMIT :limit OFFSET :offset';

    $stmt = db()->prepare($sql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->bindValue('limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue('offset', ($page - 1) * $perPage, PDO::PARAM_INT);
    $stmt->execute();

    $items = array_map(static fn (array $row): array => page_payload($row), $stmt->fetchAll());

    json_response([
        'items' => $items,
        'total' => $total,
        'page' => $page,
        'per_page' => $perPage,
    ]);
}

function api_status_param(): ?string
{
    $status = request_param('status');

    if ($status !== null && !in_array($status, ['draft', 'published'], true)) {
        json_response(['error' => 'invalid status'], 422);
    }

    if ($status !== null && $status === 'draft') {
        /*
         * Drafts are only visible to users who may write pages; a draft
         * listing never leaks to anonymous visitors or viewers.
         */
        $user = current_user();

        if ($user === null || !can((int) $user['id'], 'pages.write')) {
            $status = 'published';
        }
    }

    if ($status !== null) {
        return $status;
    }

    /*
     * No explicit status: users who may write pages get drafts alongside
     * published ones; everyone else sees published only. Public surfaces
     * (e.g. the home page) pass status=published explicitly so they stay
     * public even for editors.
     */
    $user = current_user();

    return $user !== null && can((int) $user['id'], 'pages.write') ? null : 'published';
}

function api_pages_get(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $id = (int) request_param('id', '0');
    $slug = request_param('slug');
    $page = fetch_page($id, $slug);

    if ($page === null) {
        /*
         * Virtual demo page: when no real page occupies the reserved slug,
         * serve the shared markdown reference (see demo_page.php) so the
         * release artifact can show it without a DB row.
         */
        if ($slug !== null && $slug === DEMO_PAGE_SLUG) {
            json_response(['page' => demo_page_payload()]);
        }

        json_response(['error' => 'page not found'], 404);
    }

    if (!can_view_page(current_user(), $page)) {
        json_response(['error' => 'page not found'], 404);
    }

    /*
     * Drafts are never public: only users who may edit the page (author,
     * edit grant, or admin) can fetch one. Everyone else gets 404 so a
     * draft slug cannot be read by guessing its URL.
     */
    $user = current_user();

    if ($page['status'] === 'draft'
        && ($user === null || !can_edit_page($user, (int) $page['id']))) {
        json_response(['error' => 'page not found'], 404);
    }

    json_response(['page' => page_payload($page)]);
}

function api_pages_create(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('pages.write');
    $user = current_user();
    $body = read_json_body();

    $slug = trim((string) ($body['slug'] ?? ''));
    $title = trim((string) ($body['title'] ?? ''));
    $content = (string) ($body['content_md'] ?? '');
    $status = (string) ($body['status'] ?? 'draft');
    $createdAt = normalize_datetime($body['created_at'] ?? '');
    $updatedAt = normalize_datetime($body['updated_at'] ?? '');

    $errors = [];

    $slugErrors = validate_slug($slug);
    if ($slugErrors !== []) {
        $errors['slug'] = $slugErrors;
    }

    if ($title === '') {
        $errors['title'] = ['required'];
    } elseif (mb_strlen($title) > 200) {
        $errors['title'] = ['must be at most 200 characters'];
    }

    if (strlen($content) > 1024 * 1024) {
        $errors['content_md'] = ['too large (max 1 MB)'];
    }

    if (!in_array($status, ['draft', 'published'], true)) {
        $errors['status'] = ['must be draft or published'];
    }

    if (array_key_exists('created_at', $body)
        && is_string($body['created_at'])
        && trim($body['created_at']) !== ''
        && $createdAt === '') {
        $errors['created_at'] = ['must be YYYY-MM-DD HH:MM(:SS)'];
    }

    if (array_key_exists('updated_at', $body)
        && is_string($body['updated_at'])
        && trim($body['updated_at']) !== ''
        && $updatedAt === '') {
        $errors['updated_at'] = ['must be YYYY-MM-DD HH:MM(:SS)'];
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    $stmt = db()->prepare('SELECT 1 FROM pages WHERE slug = ?');
    $stmt->execute([$slug]);
    if ($stmt->fetch() !== false) {
        json_response(['error' => 'slug already exists'], 409);
    }

    $stmt = db()->prepare(
        'INSERT INTO pages (slug, title, content_md, status, created_by, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $slug,
        $title,
        $content,
        $status,
        $user['id'],
        $user['id'],
        $createdAt !== '' ? $createdAt : date('Y-m-d H:i:s'),
        $updatedAt !== '' ? $updatedAt : date('Y-m-d H:i:s'),
    ]);

    $pageId = (int) db()->lastInsertId();
    grant_default_guest_view($pageId, $user['id']);

    json_response(['page' => page_payload(fetch_page($pageId))], 201);
}

function api_pages_update(string $method): never
{
    if ($method !== 'PATCH') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('pages.write');
    $body = read_json_body();

    $id = (int) ($body['id'] ?? request_param('id', '0'));
    $page = fetch_page($id);

    if ($page === null) {
        json_response(['error' => 'page not found'], 404);
    }

    require_page_edit($page);

    $sets = [];
    $params = [];
    $errors = [];

    if (array_key_exists('slug', $body)) {
        $slug = trim((string) $body['slug']);
        $slugErrors = validate_slug($slug);
        if ($slugErrors !== []) {
            $errors['slug'] = $slugErrors;
        } else {
            $stmt = db()->prepare('SELECT 1 FROM pages WHERE slug = ? AND id <> ?');
            $stmt->execute([$slug, $id]);
            if ($stmt->fetch() !== false) {
                $errors['slug'] = ['already exists'];
            } else {
                $sets[] = 'slug = :slug';
                $params['slug'] = $slug;
            }
        }
    }

    if (array_key_exists('title', $body)) {
        $title = trim((string) $body['title']);
        if ($title === '') {
            $errors['title'] = ['required'];
        } elseif (mb_strlen($title) > 200) {
            $errors['title'] = ['must be at most 200 characters'];
        } else {
            $sets[] = 'title = :title';
            $params['title'] = $title;
        }
    }

    if (array_key_exists('content_md', $body)) {
        $content = (string) $body['content_md'];
        if (strlen($content) > 1024 * 1024) {
            $errors['content_md'] = ['too large (max 1 MB)'];
        } else {
            $sets[] = 'content_md = :content_md';
            $params['content_md'] = $content;
        }
    }

    if (array_key_exists('status', $body)) {
        $status = (string) $body['status'];
        if (!in_array($status, ['draft', 'published'], true)) {
            $errors['status'] = ['must be draft or published'];
        } else {
            $sets[] = 'status = :status';
            $params['status'] = $status;
        }
    }

    if (array_key_exists('created_at', $body)) {
        $createdAt = is_string($body['created_at']) ? normalize_datetime($body['created_at']) : '';

        if ($createdAt === '') {
            if (is_string($body['created_at']) && trim($body['created_at']) !== '') {
                $errors['created_at'] = ['must be YYYY-MM-DD HH:MM(:SS)'];
            }
        } else {
            $sets[] = 'created_at = :created_at';
            $params['created_at'] = $createdAt;
        }
    }

    if (array_key_exists('updated_at', $body)) {
        $updatedAt = is_string($body['updated_at']) ? normalize_datetime($body['updated_at']) : '';

        if ($updatedAt === '') {
            if (is_string($body['updated_at']) && trim($body['updated_at']) !== '') {
                $errors['updated_at'] = ['must be YYYY-MM-DD HH:MM(:SS)'];
            }
        } else {
            $sets[] = 'updated_at = :updated_at';
            $params['updated_at'] = $updatedAt;
        }
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    if ($sets === []) {
        json_response(['page' => page_payload($page)]);
    }

    $sets[] = 'updated_by = :uid';
    $params['uid'] = current_user()['id'];
    $params['id'] = $id;

    if (!isset($params['updated_at'])) {
        $sets[] = 'updated_at = datetime(\'now\')';
    }

    $stmt = db()->prepare('UPDATE pages SET ' . implode(', ', $sets) . ' WHERE id = :id');
    $stmt->execute($params);

    json_response(['page' => page_payload(fetch_page($id))]);
}

function api_pages_delete(string $method): never
{
    if ($method !== 'DELETE') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('pages.delete');

    $id = (int) request_param('id', '0');
    $page = fetch_page($id);

    if ($page === null) {
        json_response(['error' => 'page not found'], 404);
    }

    /*
     * Deletion is ownership-aware: only the author (or an admin) may
     * delete a page, even though editors hold the pages.delete
     * permission. Editors can still edit pages they have a grant for.
     */
    $user = current_user();

    if (!is_admin($user) && (int) $page['created_by'] !== (int) $user['id']) {
        json_response(['error' => 'forbidden'], 403);
    }

    $stmt = db()->prepare('DELETE FROM pages WHERE id = ?');
    $stmt->execute([$id]);

    json_response(['ok' => true]);
}

function api_pages_search(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    json_response(search_pages(trim((string) request_param('q', '')), api_status_param()));
}

function api_pages_grants(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('pages.write');

    $page = fetch_page((int) request_param('page_id', '0'));

    if ($page === null) {
        json_response(['error' => 'page not found'], 404);
    }

    $user = require_auth();

    if (!is_admin($user) && (int) $page['created_by'] !== (int) $user['id']) {
        json_response(['error' => 'forbidden'], 403);
    }

    $stmt = db()->prepare(
        'SELECT u.username, u.name, gu.name AS granted_by_name, g.created_at, g.permission, g.note
           FROM page_grants g
           JOIN users u ON u.id = g.user_id
           LEFT JOIN users gu ON gu.id = g.granted_by
          WHERE g.page_id = ?
          ORDER BY u.username'
    );
    $stmt->execute([$page['id']]);
    $grantRows = $stmt->fetchAll();

    /*
     * The effective access list always includes the page owner and every
     * admin (they can edit by policy, with or without an explicit grant).
     * Explicit grants are appended; users already listed are skipped.
     */
    $items = [];
    $seen = [];

    if ($page['created_by'] !== null) {
        $stmt = db()->prepare('SELECT username, name FROM users WHERE id = ?');
        $stmt->execute([(int) $page['created_by']]);
        $owner = $stmt->fetch();

        if ($owner !== false) {
            $items[] = [
                'username' => $owner['username'],
                'name' => $owner['name'],
                'granted_by_name' => null,
                'created_at' => null,
                'permission' => 'edit',
                'note' => null,
                'kind' => 'owner',
            ];
            $seen[$owner['username']] = true;
        }
    }

    $admins = db()->query(
        'SELECT DISTINCT u.username, u.name
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
          WHERE r.code = \'admin\' AND u.is_active = 1
          ORDER BY u.username'
    )->fetchAll();

    foreach ($admins as $admin) {
        if (isset($seen[$admin['username']])) {
            continue;
        }
        $items[] = [
            'username' => $admin['username'],
            'name' => $admin['name'],
            'granted_by_name' => null,
            'created_at' => null,
            'permission' => 'edit',
            'note' => null,
            'kind' => 'admin',
        ];
        $seen[$admin['username']] = true;
    }

    foreach ($grantRows as $grant) {
        if (isset($seen[$grant['username']])) {
            continue;
        }
        $items[] = [
            'username' => $grant['username'],
            'name' => $grant['name'],
            'granted_by_name' => (string) $grant['granted_by_name'],
            'created_at' => $grant['created_at'],
            'permission' => $grant['permission'],
            'note' => $grant['note'] !== null && $grant['note'] !== '' ? $grant['note'] : null,
            'kind' => 'grant',
        ];
    }

    usort(
        $items,
        static fn (array $a, array $b): int => strcasecmp($a['username'], $b['username'])
    );

    json_response(['grants' => $items]);
}

function api_pages_grant(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('pages.write');

    $body = read_json_body();
    $page = fetch_page((int) ($body['page_id'] ?? 0));

    if ($page === null) {
        json_response(['error' => 'page not found'], 404);
    }

    $user = require_auth();

    if (!is_admin($user) && (int) $page['created_by'] !== (int) $user['id']) {
        json_response(['error' => 'forbidden'], 403);
    }

    $username = trim((string) ($body['username'] ?? ''));

    if ($username === '') {
        json_response(['error' => 'username is required'], 422);
    }

    $stmt = db()->prepare('SELECT id FROM users WHERE username = ? AND is_active = 1');
    $stmt->execute([$username]);
    $targetId = $stmt->fetchColumn();

    if ($targetId === false) {
        json_response(['error' => 'user not found'], 404);
    }

    $permission = (string) ($body['permission'] ?? 'edit');

    if (!in_array($permission, ['edit', 'view'], true)) {
        json_response(['error' => 'permission must be edit or view'], 422);
    }

    $note = array_key_exists('note', $body) && $body['note'] !== null
        ? trim((string) $body['note'])
        : null;

    if ($note !== null && mb_strlen($note) > 200) {
        json_response(['error' => 'note is too long (max 200 characters)'], 422);
    }

    if ($permission === 'edit' && $username !== '_guest_' && !can((int) $targetId, 'pages.write')) {
        json_response(['error' => 'user lacks pages.write permission'], 422);
    }

    /*
     * Upsert: granting again with a different permission updates the
     * existing grant (used by the editor's edit/view toggle). The note is
     * only touched when the client sends it, so a permission-only change
     * keeps the existing note.
     */
    $stmt = db()->prepare(
        'INSERT INTO page_grants (page_id, user_id, granted_by, permission, note)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(page_id, user_id)
         DO UPDATE SET granted_by = excluded.granted_by, permission = excluded.permission,
                       note = COALESCE(excluded.note, page_grants.note)'
    );
    $stmt->execute([$page['id'], (int) $targetId, $user['id'], $permission, $note]);

    json_response(['ok' => true]);
}

function api_pages_revoke_grant(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('pages.write');

    $body = read_json_body();
    $page = fetch_page((int) ($body['page_id'] ?? 0));

    if ($page === null) {
        json_response(['error' => 'page not found'], 404);
    }

    $user = require_auth();

    if (!is_admin($user) && (int) $page['created_by'] !== (int) $user['id']) {
        json_response(['error' => 'forbidden'], 403);
    }

    $username = trim((string) ($body['username'] ?? ''));

    if ($username === '') {
        json_response(['error' => 'username is required'], 422);
    }

    if ($username === '_guest_') {
        json_response(['error' => 'the guest grant cannot be removed'], 422);
    }

    $stmt = db()->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $targetId = $stmt->fetchColumn();

    if ($targetId === false) {
        json_response(['error' => 'user not found'], 404);
    }

    $stmt = db()->prepare('DELETE FROM page_grants WHERE page_id = ? AND user_id = ?');
    $stmt->execute([$page['id'], (int) $targetId]);

    json_response(['ok' => true]);
}

function api_users_list(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('users.manage');

    $users = db()->query(
        'SELECT id, username, email, name, is_active, must_change_password, created_at, updated_at
           FROM users WHERE username <> \'_guest_\' ORDER BY id'
    )->fetchAll();

    $roles = db()->query(
        'SELECT ur.user_id, r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id'
    )->fetchAll();

    $byUser = [];

    foreach ($roles as $row) {
        $byUser[$row['user_id']][] = $row['code'];
    }

    foreach ($users as &$row) {
        $row['roles'] = $byUser[$row['id']] ?? [];
    }
    unset($row);

    json_response(['users' => $users]);
}

function api_users_create(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('users.manage');

    $body = read_json_body();
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');
    $name = trim((string) ($body['name'] ?? $username));
    $email = isset($body['email']) && $body['email'] !== '' ? trim((string) $body['email']) : null;
    $roleIds = array_values(array_unique(array_map('intval', (array) ($body['role_ids'] ?? []))));

    $errors = [];

    $usernameErrors = validate_username($username);
    if ($usernameErrors !== []) {
        $errors['username'] = $usernameErrors;
    }

    if ($username === '_guest_') {
        $errors['username'] = ['reserved username'];
    }

    if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = ['invalid email'];
    }

    if ($username !== '_guest_' && username_in_use_as_email($username, 0)) {
        $errors['username'] = ['already used as an email'];
    }

    if ($email !== null && email_in_use($email, 0)) {
        $errors['email'] = ['already in use'];
    }

    $passwordErrors = validate_password($password);
    if ($passwordErrors !== []) {
        $errors['password'] = $passwordErrors;
    }

    if ($roleIds !== [] && count($roleIds) !== countRoleIds($roleIds)) {
        $errors['role_ids'] = ['unknown role'];
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    $stmt = db()->prepare('SELECT 1 FROM users WHERE username = ?');
    $stmt->execute([$username]);
    if ($stmt->fetch() !== false) {
        json_response(['error' => 'username already exists'], 409);
    }

    if ($email !== null) {
        $stmt = db()->prepare('SELECT 1 FROM users WHERE email = ?');
        $stmt->execute([$email]);
        if ($stmt->fetch() !== false) {
            json_response(['error' => 'email already exists'], 409);
        }
    }

    $stmt = db()->prepare(
        'INSERT INTO users (username, email, name, password_hash) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$username, $email, $name, password_hash($password, PASSWORD_DEFAULT)]);
    $userId = (int) db()->lastInsertId();

    assign_roles($userId, $roleIds);

    json_response(['user' => user_payload($userId)], 201);
}

function api_users_update(string $method): never
{
    if ($method !== 'PATCH') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('users.manage');

    $body = read_json_body();
    $id = (int) ($body['id'] ?? request_param('id', '0'));

    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if ($row === false) {
        json_response(['error' => 'user not found'], 404);
    }

    $sets = [];
    $params = [];
    $errors = [];

    if (array_key_exists('name', $body)) {
        $sets[] = 'name = :name';
        $params['name'] = trim((string) $body['name']);
    }

    if (array_key_exists('email', $body)) {
        $email = $body['email'] === '' || $body['email'] === null
            ? null
            : trim((string) $body['email']);

        if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $errors['email'] = ['invalid email'];
        } elseif (email_in_use($email, $id)) {
            $errors['email'] = ['already in use'];
        } else {
            $sets[] = 'email = :email';
            $params['email'] = $email;
        }
    }

    if (array_key_exists('password', $body) && $body['password'] !== '') {
        $passwordErrors = validate_password((string) $body['password']);
        if ($passwordErrors !== []) {
            $errors['password'] = $passwordErrors;
        } else {
            $sets[] = 'password_hash = :password';
            $params['password'] = password_hash((string) $body['password'], PASSWORD_DEFAULT);
        }
    }

    if (array_key_exists('is_active', $body)) {
        $sets[] = 'is_active = :is_active';
        $params['is_active'] = (int) (bool) $body['is_active'];
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    if ($sets !== []) {
        $sets[] = 'updated_at = datetime(\'now\')';
        $params['id'] = $id;
        db()->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = :id')
            ->execute($params);
    }

    json_response(['user' => user_payload($id)]);
}

function api_users_set_roles(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('roles.manage');

    $body = read_json_body();
    $id = (int) ($body['id'] ?? 0);
    $roleIds = array_values(array_unique(array_map('intval', (array) ($body['role_ids'] ?? []))));

    $stmt = db()->prepare('SELECT 1 FROM users WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->fetch() === false) {
        json_response(['error' => 'user not found'], 404);
    }

    if ($roleIds !== [] && count($roleIds) !== countRoleIds($roleIds)) {
        json_response(['error' => 'unknown role'], 422);
    }

    assign_roles($id, $roleIds);

    json_response(['user' => user_payload($id)]);
}

function api_roles_list(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('roles.manage');

    $roles = db()->query('SELECT id, code, name, description FROM roles ORDER BY id')->fetchAll();

    $links = db()->query(
        'SELECT rp.role_id, p.code
           FROM role_permissions rp JOIN permissions p ON p.id = rp.permission_id
          ORDER BY p.code'
    )->fetchAll();

    $byRole = [];

    foreach ($links as $row) {
        $byRole[$row['role_id']][] = $row['code'];
    }

    foreach ($roles as &$row) {
        $row['permissions'] = $byRole[$row['id']] ?? [];
    }
    unset($row);

    json_response(['roles' => $roles]);
}

/**
 * All tags across every page, with usage counts, sorted by count
 * (descending) then name. Tags are read from each page's front matter.
 */
function api_tags_list(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $view = view_filter_sql();
    $where = $view['clause'] !== '' ? 'WHERE ' . $view['clause'] : '';
    $stmt = db()->prepare('SELECT content_md FROM pages p ' . $where);
    $stmt->execute($view['params']);

    $counts = [];

    foreach ($stmt->fetchAll() as $row) {
        foreach (front_matter_tags($row['content_md']) as $tag) {
            $counts[$tag] = ($counts[$tag] ?? 0) + 1;
        }
    }

    $tags = [];

    foreach ($counts as $name => $count) {
        $tags[] = ['name' => $name, 'count' => $count];
    }

    usort(
        $tags,
        static fn (array $a, array $b): int => [$b['count'], $a['name']] <=> [$a['count'], $b['name']]
    );

    json_response(['tags' => $tags]);
}

/* ------------------------------------------------------------------ */
/* Assets                                                             */
/* ------------------------------------------------------------------ */

function api_assets_list(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_auth();

    $kind = request_param('kind');

    if ($kind !== null && !in_array($kind, ['image', 'video'], true)) {
        json_response(['error' => 'invalid kind'], 422);
    }

    $q = request_param('q');
    $page = max(1, (int) request_param('page', '1'));
    $perPage = min(100, max(1, (int) request_param('per_page', '20')));

    $where = [];
    $params = [];

    if ($kind !== null) {
        $where[] = 'a.kind = :kind';
        $params['kind'] = $kind;
    }

    if ($q !== null && trim($q) !== '') {
        $where[] = 'a.name LIKE :q';
        $params['q'] = '%' . trim($q) . '%';
    }

    $whereSql = $where === [] ? '' : 'WHERE ' . implode(' AND ', $where);

    $stmt = db()->prepare('SELECT COUNT(*) FROM assets a ' . $whereSql);
    $stmt->execute($params);
    $total = (int) $stmt->fetchColumn();

    $sql = 'SELECT a.*, u.name AS uploaded_by_name
              FROM assets a
              LEFT JOIN users u ON u.id = a.uploaded_by
              ' . $whereSql . '
             ORDER BY a.created_at DESC, a.id DESC
             LIMIT :limit OFFSET :offset';

    $stmt = db()->prepare($sql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->bindValue('limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue('offset', ($page - 1) * $perPage, PDO::PARAM_INT);
    $stmt->execute();

    $items = array_map('asset_payload', $stmt->fetchAll());

    json_response([
        'items' => $items,
        'total' => $total,
        'page' => $page,
        'per_page' => $perPage,
    ]);
}

function api_assets_get(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_auth();

    $row = fetch_asset_meta((int) request_param('id', '0'));

    if ($row === null) {
        json_response(['error' => 'asset not found'], 404);
    }

    json_response(['asset' => asset_payload($row)]);
}

function api_assets_create(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('assets.upload');

    /*
     * Reject oversized requests up front from the declared length when
     * PHP has not already capped them (post_max_size truncates before
     * any app code runs, so this is defense-in-depth for honest clients).
     */
    $declared = (int) ($_SERVER['CONTENT_LENGTH'] ?? 0);

    if ($declared > 0 && $declared > asset_effective_cap('video') + 1024 * 1024) {
        json_response([
            'error' => 'file too large',
            'max_bytes' => asset_effective_cap('video'),
        ], 413);
    }

    if (!isset($_FILES['file']) || $_FILES['file']['error'] === UPLOAD_ERR_NO_FILE) {
        json_response(['error' => 'file is required'], 422);
    }

    $file = $_FILES['file'];

    if ($file['error'] === UPLOAD_ERR_INI_SIZE || $file['error'] === UPLOAD_ERR_FORM_SIZE) {
        json_response([
            'error' => 'file too large',
            'max_bytes' => asset_php_upload_limit(),
            'reason' => 'php_upload_limit',
        ], 413);
    }

    if ($file['error'] !== UPLOAD_ERR_OK) {
        json_response(['error' => 'upload failed'], 400);
    }

    $size = (int) filesize($file['tmp_name']);

    /*
     * MIME is sniffed from magic bytes, never trusted from the client.
     * The client-declared type is only a tie-breaker when fileinfo is
     * unavailable.
     */
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo !== false ? (string) finfo_file($finfo, $file['tmp_name']) : '';
    if ($finfo !== false) {
        finfo_close($finfo);
    }
    if ($mime === '' || $mime === 'application/octet-stream') {
        $mime = (string) ($file['type'] ?? '');
    }

    $kind = asset_kind_for_mime($mime);

    if ($kind === null) {
        json_response(['error' => 'unsupported file type', 'mime' => $mime], 415);
    }

    $cap = asset_effective_cap($kind);

    if ($size > $cap) {
        json_response(['error' => 'file too large', 'max_bytes' => $cap], 413);
    }

    $name = trim((string) ($_POST['name'] ?? $file['name'] ?? ''));
    $name = (string) preg_replace('/[\x00-\x1F\/\\\\]/', '_', $name);
    $name = trim($name);

    if ($name === '') {
        $name = 'asset';
    }

    if (strlen($name) > ASSET_MAX_NAME_BYTES) {
        $name = substr($name, 0, ASSET_MAX_NAME_BYTES);
    }

    $width = isset($_POST['width']) && $_POST['width'] !== '' ? (int) $_POST['width'] : null;
    $height = isset($_POST['height']) && $_POST['height'] !== '' ? (int) $_POST['height'] : null;
    $duration = isset($_POST['duration']) && $_POST['duration'] !== '' ? (float) $_POST['duration'] : null;

    if ($width !== null && $width <= 0) {
        $width = null;
    }
    if ($height !== null && $height <= 0) {
        $height = null;
    }
    if ($duration !== null && $duration <= 0) {
        $duration = null;
    }

    /*
     * Content-addressed dedupe: an identical file returns the existing
     * row instead of inserting a duplicate.
     */
    $md5 = md5_file($file['tmp_name']);
    $stmt = db()->prepare('SELECT id FROM assets WHERE md5 = ?');
    $stmt->execute([$md5]);
    $existingId = $stmt->fetchColumn();

    if ($existingId !== false) {
        json_response([
            'asset' => asset_payload(fetch_asset_meta((int) $existingId)),
            'duplicate' => true,
        ], 200);
    }

    /*
     * The optional thumbnail (generated client-side) is stored beside the
     * original. It is tiny (<= ASSET_THUMB_MAX_BYTES), so buffering it is
     * fine; the original is bound as a stream to keep PHP memory bounded.
     */
    $thumb = null;
    $thumbMime = null;

    if (isset($_FILES['thumb']) && $_FILES['thumb']['error'] === UPLOAD_ERR_OK) {
        $thumbSize = (int) filesize($_FILES['thumb']['tmp_name']);

        if ($thumbSize > 0 && $thumbSize <= ASSET_THUMB_MAX_BYTES) {
            $thumb = file_get_contents($_FILES['thumb']['tmp_name']);
            $thumbMime = (string) ($_FILES['thumb']['type'] ?? '');

            if ($thumbMime === '' || !str_starts_with($thumbMime, 'image/')) {
                $tfinfo = finfo_open(FILEINFO_MIME_TYPE);
                if ($tfinfo !== false) {
                    $thumbMime = (string) finfo_file($tfinfo, $_FILES['thumb']['tmp_name']);
                    finfo_close($tfinfo);
                }
            }

            if (!str_starts_with($thumbMime, 'image/')) {
                $thumbMime = 'image/webp';
            }
        }
    }

    $user = current_user();

    $stmt = db()->prepare(
        'INSERT INTO assets (name, mime, kind, size_bytes, width, height, duration,
                             md5, data, thumb, thumb_mime, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->bindValue(1, $name);
    $stmt->bindValue(2, $mime);
    $stmt->bindValue(3, $kind);
    $stmt->bindValue(4, $size, PDO::PARAM_INT);
    $stmt->bindValue(5, $width, PDO::PARAM_INT);
    $stmt->bindValue(6, $height, PDO::PARAM_INT);
    $stmt->bindValue(7, $duration);
    $stmt->bindValue(8, $md5);
    $stmt->bindValue(9, fopen($file['tmp_name'], 'rb'), PDO::PARAM_LOB);
    $stmt->bindValue(10, $thumb, $thumb !== null ? PDO::PARAM_LOB : PDO::PARAM_NULL);
    $stmt->bindValue(11, $thumbMime);
    $stmt->bindValue(12, $user['id'], PDO::PARAM_INT);
    $stmt->execute();

    $id = (int) db()->lastInsertId();

    json_response(['asset' => asset_payload(fetch_asset_meta($id))], 201);
}

function api_assets_update(string $method): never
{
    if ($method !== 'PATCH') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_auth();

    $body = read_json_body();
    $row = fetch_asset_meta((int) ($body['id'] ?? request_param('id', '0')));

    if ($row === null) {
        json_response(['error' => 'asset not found'], 404);
    }

    $user = current_user();

    if (!is_admin($user) && (int) $row['uploaded_by'] !== (int) $user['id']) {
        json_response(['error' => 'forbidden'], 403);
    }

    $sets = [];
    $params = [];
    $errors = [];

    if (array_key_exists('name', $body)) {
        $name = trim((string) $body['name']);

        if ($name === '') {
            $errors['name'] = ['required'];
        } elseif (strlen($name) > ASSET_MAX_NAME_BYTES) {
            $errors['name'] = ['must be at most ' . ASSET_MAX_NAME_BYTES . ' characters'];
        } else {
            $sets[] = 'name = :name';
            $params['name'] = $name;
        }
    }

    if (array_key_exists('is_public', $body)) {
        $sets[] = 'is_public = :is_public';
        $params['is_public'] = (int) (bool) $body['is_public'];
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    if ($sets !== []) {
        $params['id'] = (int) $row['id'];
        db()->prepare('UPDATE assets SET ' . implode(', ', $sets) . ' WHERE id = :id')
            ->execute($params);
    }

    json_response(['asset' => asset_payload(fetch_asset_meta((int) $row['id']))]);
}

function api_assets_delete(string $method): never
{
    if ($method !== 'DELETE') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_auth();

    $row = fetch_asset_meta((int) request_param('id', '0'));

    if ($row === null) {
        json_response(['error' => 'asset not found'], 404);
    }

    $user = current_user();

    if (!is_admin($user)
        && !can((int) $user['id'], 'assets.upload')
        && (int) $row['uploaded_by'] !== (int) $user['id']) {
        json_response(['error' => 'forbidden'], 403);
    }

    db()->prepare('DELETE FROM assets WHERE id = ?')->execute([(int) $row['id']]);

    json_response(['ok' => true]);
}

/* ------------------------------------------------------------------ */
/* Key-value store (KVs)                                              */
/* ------------------------------------------------------------------ */

const KV_MAX_KEY_LENGTH = 200;
const KV_MAX_VALUE_BYTES = 1024 * 1024;
const KV_BATCH_MAX_KEYS = 100;

function kv_fetch(string $key): ?array
{
    $stmt = db()->prepare(
        'SELECT k.*, cu.name AS created_by_name, uu.name AS updated_by_name
           FROM kv_pairs k
           LEFT JOIN users cu ON cu.id = k.created_by
           LEFT JOIN users uu ON uu.id = k.updated_by
          WHERE k.key = ?'
    );
    $stmt->execute([$key]);
    $row = $stmt->fetch();

    return $row === false ? null : $row;
}

/**
 * SQL clause (with named params) restricting a kv_pairs query to rows the
 * current user may view: pairs they created, pairs carrying a grant for
 * them or for the _guest_ user (i.e. public). Admins see everything.
 */
function kv_view_filter_sql(): array
{
    $user = current_user();

    if ($user !== null && is_admin($user)) {
        return ['clause' => '', 'params' => []];
    }

    $uid = $user !== null ? (int) $user['id'] : -1;
    $guestId = guest_user_id();
    $ids = $guestId !== null ? [$guestId] : [];

    if ($uid > 0) {
        $ids[] = $uid;
    }

    $ids = array_values(array_unique($ids));
    $inParams = [];

    foreach ($ids as $i => $id) {
        $inParams[':kvf' . $i] = $id;
    }

    $placeholders = implode(',', array_keys($inParams));
    $clause = '(k.created_by = :kvfu OR EXISTS (
        SELECT 1 FROM kv_grants kg
         WHERE kg.kv_id = k.id AND kg.user_id IN (' . $placeholders . ')
    ))';

    return [
        'clause' => $clause,
        'params' => array_merge([':kvfu' => $uid], $inParams),
    ];
}

function kv_can_view(?array $user, array $row): bool
{
    if ($user !== null && is_admin($user)) {
        return true;
    }

    if ($user !== null
        && $row['created_by'] !== null
        && (int) $user['id'] === (int) $row['created_by']) {
        return true;
    }

    $guestId = guest_user_id();
    $ids = $guestId !== null ? [$guestId] : [];

    if ($user !== null) {
        $ids[] = (int) $user['id'];
    }

    $ids = array_values(array_unique($ids));

    if ($ids === []) {
        return false;
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $stmt = db()->prepare(
        'SELECT COUNT(*) FROM kv_grants
          WHERE kv_id = ? AND user_id IN (' . $placeholders . ')'
    );
    $stmt->execute(array_merge([(int) $row['id']], $ids));

    return (int) $stmt->fetchColumn() > 0;
}

function kv_can_edit(array $user, array $row): bool
{
    if (is_admin($user)) {
        return true;
    }

    if ($row['created_by'] !== null && (int) $user['id'] === (int) $row['created_by']) {
        return true;
    }

    $stmt = db()->prepare(
        "SELECT COUNT(*) FROM kv_grants
          WHERE kv_id = ? AND user_id = ? AND permission = 'edit'"
    );
    $stmt->execute([(int) $row['id'], (int) $user['id']]);

    return (int) $stmt->fetchColumn() > 0;
}

function kv_require_edit(array $row): void
{
    $user = require_auth();

    if (!kv_can_edit($user, $row)) {
        json_response([
            'error' => 'forbidden',
            'reason' => 'not the owner and no edit grant',
        ], 403);
    }
}

/**
 * Owner/admin gate for destructive and grant-management operations.
 */
function kv_require_owner_admin(array $row): void
{
    $user = require_auth();

    if (!is_admin($user)
        && ($row['created_by'] === null || (int) $row['created_by'] !== (int) $user['id'])) {
        json_response(['error' => 'forbidden'], 403);
    }
}

function kv_is_public(array $row): bool
{
    $guestId = guest_user_id();

    if ($guestId === null) {
        return false;
    }

    $stmt = db()->prepare('SELECT COUNT(*) FROM kv_grants WHERE kv_id = ? AND user_id = ?');
    $stmt->execute([(int) $row['id'], $guestId]);

    return (int) $stmt->fetchColumn() > 0;
}

function kv_payload(array $row): array
{
    $user = current_user();
    $schema = null;
    if ($row['schema_json'] !== null && $row['schema_json'] !== '') {
        $schema = json_decode($row['schema_json'], true);
    }

    return [
        'id' => (int) $row['id'],
        'key' => $row['key'],
        'value' => json_decode($row['value_json'], true),
        'schema' => $schema,
        'public' => kv_is_public($row),
        'created_by' => $row['created_by'] !== null ? (int) $row['created_by'] : null,
        'created_by_name' => (string) ($row['created_by_name'] ?? ''),
        'updated_by' => $row['updated_by'] !== null ? (int) $row['updated_by'] : null,
        'updated_by_name' => (string) ($row['updated_by_name'] ?? ''),
        'created_at' => $row['created_at'],
        'updated_at' => $row['updated_at'],
        'can_edit' => $user !== null && kv_can_edit($user, $row),
    ];
}

function kv_grant_default_guest_view(int $kvId, int $grantedBy): void
{
    $guestId = guest_user_id();

    if ($guestId === null) {
        return;
    }

    db()->prepare(
        'INSERT OR IGNORE INTO kv_grants (kv_id, user_id, granted_by, permission)
         VALUES (?, ?, ?, ?)'
    )->execute([$kvId, $guestId, $grantedBy, 'view']);
}

/**
 * Encode the request body's `value` into a JSON string, appending a
 * `value` validation error when it is missing or not JSON-encodable.
 */
function kv_encode_value(array $body, array &$errors): string
{
    if (!array_key_exists('value', $body)) {
        $errors['value'] = ['required'];
        return '';
    }

    $json = json_encode($body['value'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    if ($json === false) {
        $errors['value'] = ['must be valid JSON'];
        return '';
    }

    if (strlen($json) > KV_MAX_VALUE_BYTES) {
        $errors['value'] = ['too large (max ' . KV_MAX_VALUE_BYTES . ' bytes)'];
        return '';
    }

    return $json;
}

function api_kvs_list(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $q = request_param('q');
    $page = max(1, (int) request_param('page', '1'));
    $perPage = min(100, max(1, (int) request_param('per_page', '20')));

    $view = kv_view_filter_sql();
    $whereParts = [];
    $params = [];

    if ($q !== null && trim($q) !== '') {
        $whereParts[] = 'k.key LIKE :q';
        $params['q'] = '%' . trim($q) . '%';
    }

    if ($view['clause'] !== '') {
        $whereParts[] = $view['clause'];
    }

    $where = $whereParts === [] ? '' : 'WHERE ' . implode(' AND ', $whereParts);
    $params = array_merge($params, $view['params']);

    $stmt = db()->prepare('SELECT COUNT(*) FROM kv_pairs k ' . $where);
    $stmt->execute($params);
    $total = (int) $stmt->fetchColumn();

    $sql = 'SELECT k.*, cu.name AS created_by_name, uu.name AS updated_by_name
              FROM kv_pairs k
              LEFT JOIN users cu ON cu.id = k.created_by
              LEFT JOIN users uu ON uu.id = k.updated_by
              ' . $where . '
             ORDER BY k.updated_at DESC, k.id DESC
             LIMIT :limit OFFSET :offset';

    $stmt = db()->prepare($sql);
    foreach ($params as $k => $v) {
        $stmt->bindValue($k, $v);
    }
    $stmt->bindValue('limit', $perPage, PDO::PARAM_INT);
    $stmt->bindValue('offset', ($page - 1) * $perPage, PDO::PARAM_INT);
    $stmt->execute();

    $items = array_map('kv_payload', $stmt->fetchAll());

    json_response([
        'items' => $items,
        'total' => $total,
        'page' => $page,
        'per_page' => $perPage,
    ]);
}

function api_kvs_get(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $row = kv_fetch((string) request_param('key', ''));

    if ($row === null || !kv_can_view(current_user(), $row)) {
        json_response(['error' => 'kv pair not found'], 404);
    }

    json_response(['kv' => kv_payload($row)]);
}

function api_kvs_batch_get(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $body = read_json_body();
    $raw = $body['keys'] ?? null;

    if (!is_array($raw)) {
        json_response(
            ['error' => 'validation failed', 'errors' => ['keys' => ['must be an array']]],
            422,
        );
    }

    $seen = [];
    $keys = [];

    foreach ($raw as $entry) {
        if (!is_string($entry)) {
            json_response(
                ['error' => 'validation failed', 'errors' => ['keys' => ['must be an array of strings']]],
                422,
            );
        }

        $key = trim($entry);

        if ($key === '' || isset($seen[$key])) {
            continue;
        }

        $seen[$key] = true;
        $keys[] = $key;
    }

    if (count($keys) > KV_BATCH_MAX_KEYS) {
        json_response(
            [
                'error' => 'validation failed',
                'errors' => ['keys' => ['too many keys (max ' . KV_BATCH_MAX_KEYS . ')']],
            ],
            422,
        );
    }

    $data = [];
    $notFound = $keys;

    if ($keys !== []) {
        $inParams = [];

        foreach ($keys as $i => $k) {
            $inParams[':k' . $i] = $k;
        }

        $placeholders = implode(',', array_keys($inParams));
        $stmt = db()->prepare('SELECT * FROM kv_pairs WHERE key IN (' . $placeholders . ')');
        $stmt->execute($inParams);
        $user = current_user();

        while ($row = $stmt->fetch()) {
            if (!kv_can_view($user, $row)) {
                continue;
            }

            $idx = array_search($row['key'], $keys, true);

            if ($idx !== false) {
                unset($notFound[$idx]);
            }

            $data[$row['key']] = json_decode($row['value_json'], true);
        }

        $notFound = array_values($notFound);
    }

    json_response(['data' => $data, 'not_found' => $notFound]);
}

function api_kvs_create(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('kvs.write');
    $user = current_user();
    $body = read_json_body();

    $key = trim((string) ($body['key'] ?? ''));
    $errors = [];

    if ($key === '') {
        $errors['key'] = ['required'];
    } elseif (mb_strlen($key) > KV_MAX_KEY_LENGTH) {
        $errors['key'] = ['must be at most ' . KV_MAX_KEY_LENGTH . ' characters'];
    }

    $json = kv_encode_value($body, $errors);

    $schemaJson = null;
    if (array_key_exists('schema', $body) && $body['schema'] !== null) {
        $schemaJson = json_encode($body['schema'], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($schemaJson === false) {
            $errors['schema'] = ['must be valid JSON'];
        } elseif (strlen($schemaJson) > 65536) {
            $errors['schema'] = ['too large (max 64 KB)'];
        }
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    $stmt = db()->prepare('SELECT 1 FROM kv_pairs WHERE key = ?');
    $stmt->execute([$key]);
    if ($stmt->fetch() !== false) {
        json_response(['error' => 'key already exists'], 409);
    }

    $stmt = db()->prepare(
        'INSERT INTO kv_pairs (key, value_json, schema_json, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([$key, $json, $schemaJson, $user['id'], $user['id']]);

    $kvId = (int) db()->lastInsertId();
    kv_grant_default_guest_view($kvId, $user['id']);

    json_response(['kv' => kv_payload(kv_fetch($key))], 201);
}

function api_kvs_update(string $method): never
{
    if ($method !== 'PATCH') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $body = read_json_body();
    $row = kv_fetch((string) ($body['key'] ?? request_param('key', '')));

    if ($row === null) {
        json_response(['error' => 'kv pair not found'], 404);
    }

    kv_require_edit($row);

    $sets = [];
    $params = [];
    $errors = [];

    if (array_key_exists('new_key', $body)) {
        $newKey = trim((string) $body['new_key']);

        if ($newKey === '') {
            $errors['key'] = ['required'];
        } elseif (mb_strlen($newKey) > KV_MAX_KEY_LENGTH) {
            $errors['key'] = ['must be at most ' . KV_MAX_KEY_LENGTH . ' characters'];
        } else {
            $stmt = db()->prepare('SELECT 1 FROM kv_pairs WHERE key = ? AND id <> ?');
            $stmt->execute([$newKey, $row['id']]);
            if ($stmt->fetch() !== false) {
                $errors['key'] = ['already exists'];
            } else {
                $sets[] = 'key = :key';
                $params['key'] = $newKey;
            }
        }
    }

    if (array_key_exists('value', $body)) {
        $json = kv_encode_value($body, $errors);

        if (!isset($errors['value'])) {
            $sets[] = 'value_json = :value_json';
            $params['value_json'] = $json;
        }
    }

    if (array_key_exists('schema', $body)) {
        $schema = $body['schema'];

        if ($schema === null) {
            $sets[] = 'schema_json = NULL';
        } else {
            $schemaJson = json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            if ($schemaJson === false) {
                $errors['schema'] = ['must be valid JSON'];
            } elseif (strlen($schemaJson) > 65536) {
                $errors['schema'] = ['too large (max 64 KB)'];
            } else {
                $sets[] = 'schema_json = :schema_json';
                $params['schema_json'] = $schemaJson;
            }
        }
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    if ($sets !== []) {
        $sets[] = 'updated_by = :uid';
        $params['uid'] = current_user()['id'];
        $sets[] = 'updated_at = datetime(\'now\')';
        $params['id'] = $row['id'];
        db()->prepare('UPDATE kv_pairs SET ' . implode(', ', $sets) . ' WHERE id = :id')
            ->execute($params);
    }

    $finalKey = $params['key'] ?? $row['key'];
    json_response(['kv' => kv_payload(kv_fetch($finalKey))]);
}

function api_kvs_delete(string $method): never
{
    if ($method !== 'DELETE') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $row = kv_fetch((string) request_param('key', ''));

    if ($row === null) {
        json_response(['error' => 'kv pair not found'], 404);
    }

    kv_require_owner_admin($row);

    db()->prepare('DELETE FROM kv_pairs WHERE id = ?')->execute([(int) $row['id']]);

    json_response(['ok' => true]);
}

function api_kvs_grants(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $row = kv_fetch((string) request_param('key', ''));

    if ($row === null) {
        json_response(['error' => 'kv pair not found'], 404);
    }

    kv_require_owner_admin($row);

    $stmt = db()->prepare(
        'SELECT u.username, u.name, gu.name AS granted_by_name, g.created_at, g.permission, g.note
           FROM kv_grants g
           JOIN users u ON u.id = g.user_id
           LEFT JOIN users gu ON gu.id = g.granted_by
          WHERE g.kv_id = ?
          ORDER BY u.username'
    );
    $stmt->execute([$row['id']]);
    $grantRows = $stmt->fetchAll();

    $items = [];
    $seen = [];

    if ($row['created_by'] !== null) {
        $stmt = db()->prepare('SELECT username, name FROM users WHERE id = ?');
        $stmt->execute([(int) $row['created_by']]);
        $owner = $stmt->fetch();

        if ($owner !== false) {
            $items[] = [
                'username' => $owner['username'],
                'name' => $owner['name'],
                'granted_by_name' => null,
                'created_at' => null,
                'permission' => 'edit',
                'note' => null,
                'kind' => 'owner',
            ];
            $seen[$owner['username']] = true;
        }
    }

    $admins = db()->query(
        'SELECT DISTINCT u.username, u.name
           FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
          WHERE r.code = \'admin\' AND u.is_active = 1
          ORDER BY u.username'
    )->fetchAll();

    foreach ($admins as $admin) {
        if (isset($seen[$admin['username']])) {
            continue;
        }
        $items[] = [
            'username' => $admin['username'],
            'name' => $admin['name'],
            'granted_by_name' => null,
            'created_at' => null,
            'permission' => 'edit',
            'note' => null,
            'kind' => 'admin',
        ];
        $seen[$admin['username']] = true;
    }

    foreach ($grantRows as $grant) {
        if (isset($seen[$grant['username']])) {
            continue;
        }
        $items[] = [
            'username' => $grant['username'],
            'name' => $grant['name'],
            'granted_by_name' => (string) $grant['granted_by_name'],
            'created_at' => $grant['created_at'],
            'permission' => $grant['permission'],
            'note' => $grant['note'] !== null && $grant['note'] !== '' ? $grant['note'] : null,
            'kind' => 'grant',
        ];
    }

    usort(
        $items,
        static fn (array $a, array $b): int => strcasecmp($a['username'], $b['username'])
    );

    json_response(['grants' => $items]);
}

function api_kvs_grant(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $body = read_json_body();
    $row = kv_fetch((string) ($body['key'] ?? ''));

    if ($row === null) {
        json_response(['error' => 'kv pair not found'], 404);
    }

    kv_require_owner_admin($row);

    $username = trim((string) ($body['username'] ?? ''));

    if ($username === '') {
        json_response(['error' => 'username is required'], 422);
    }

    $stmt = db()->prepare('SELECT id FROM users WHERE username = ? AND is_active = 1');
    $stmt->execute([$username]);
    $targetId = $stmt->fetchColumn();

    if ($targetId === false) {
        json_response(['error' => 'user not found'], 404);
    }

    $permission = (string) ($body['permission'] ?? 'view');

    if (!in_array($permission, ['edit', 'view'], true)) {
        json_response(['error' => 'permission must be edit or view'], 422);
    }

    $note = array_key_exists('note', $body) && $body['note'] !== null
        ? trim((string) $body['note'])
        : null;

    if ($note !== null && mb_strlen($note) > 200) {
        json_response(['error' => 'note is too long (max 200 characters)'], 422);
    }

    if ($permission === 'edit' && $username !== '_guest_' && !can((int) $targetId, 'kvs.write')) {
        json_response(['error' => 'user lacks kvs.write permission'], 422);
    }

    $user = current_user();

    $stmt = db()->prepare(
        'INSERT INTO kv_grants (kv_id, user_id, granted_by, permission, note)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(kv_id, user_id)
         DO UPDATE SET granted_by = excluded.granted_by, permission = excluded.permission,
                       note = COALESCE(excluded.note, kv_grants.note)'
    );
    $stmt->execute([(int) $row['id'], (int) $targetId, $user['id'], $permission, $note]);

    json_response(['ok' => true]);
}

function api_kvs_revoke_grant(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $body = read_json_body();
    $row = kv_fetch((string) ($body['key'] ?? ''));

    if ($row === null) {
        json_response(['error' => 'kv pair not found'], 404);
    }

    kv_require_owner_admin($row);

    $username = trim((string) ($body['username'] ?? ''));

    if ($username === '') {
        json_response(['error' => 'username is required'], 422);
    }

    $stmt = db()->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $targetId = $stmt->fetchColumn();

    if ($targetId === false) {
        json_response(['error' => 'user not found'], 404);
    }

    db()->prepare('DELETE FROM kv_grants WHERE kv_id = ? AND user_id = ?')
        ->execute([(int) $row['id'], (int) $targetId]);

    json_response(['ok' => true]);
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * Whether the given email (or null) collides with another user's username
 * or email. Email doubles as a login credential, so both namespaces must
 * stay disjoint to keep sign-in unambiguous.
 */
function email_in_use(?string $email, int $exceptId): bool
{
    if ($email === null || trim($email) === '') {
        return false;
    }

    $stmt = db()->prepare(
        'SELECT 1 FROM users WHERE (username = :e OR email = :e) AND id <> :id'
    );
    $stmt->execute(['e' => trim($email), 'id' => $exceptId]);

    return $stmt->fetch() !== false;
}

/**
 * Whether the given username is taken as another user's email (the
 * username/email namespaces must not overlap).
 */
function username_in_use_as_email(string $username, int $exceptId): bool
{
    $stmt = db()->prepare('SELECT 1 FROM users WHERE email = :u AND id <> :id');
    $stmt->execute(['u' => $username, 'id' => $exceptId]);

    return $stmt->fetch() !== false;
}

/**
 * Number of existing roles among the given ids (used to validate role_ids).
 */
function countRoleIds(array $roleIds): int
{
    if ($roleIds === []) {
        return 0;
    }

    $placeholders = implode(',', array_fill(0, count($roleIds), '?'));
    $stmt = db()->prepare('SELECT COUNT(*) FROM roles WHERE id IN (' . $placeholders . ')');
    $stmt->execute($roleIds);

    return (int) $stmt->fetchColumn();
}

/**
 * Replace a user's role set (empty = no roles).
 */
function assign_roles(int $userId, array $roleIds): void
{
    db()->prepare('DELETE FROM user_roles WHERE user_id = ?')->execute([$userId]);

    $stmt = db()->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
    foreach ($roleIds as $roleId) {
        $stmt->execute([$userId, $roleId]);
    }
}

/* ------------------------------------------------------------------ */
/* Sifronts                                                           */
/* ------------------------------------------------------------------ */

function api_sifronts_list(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $rows = db()->query(
        'SELECT id, name, version, created_at, updated_at FROM sifronts ORDER BY id'
    )->fetchAll();

    $activeId = (string) setting_get('active_sifront_id', '');

    json_response([
        'sifronts' => array_map(
            static fn (array $r): array => [
                'id' => (int) $r['id'],
                'name' => (string) $r['name'],
                'version' => (string) $r['version'],
                'is_active' => (string) $r['id'] === $activeId,
                'created_at' => (string) $r['created_at'],
                'updated_at' => (string) $r['updated_at'],
            ],
            $rows
        ),
    ]);
}

function api_sifronts_get(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    $id = (int) request_param('id', '0');

    if ($id <= 0) {
        json_response(['error' => 'id is required'], 422);
    }

    $stmt = db()->prepare('SELECT * FROM sifronts WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if ($row === false) {
        json_response(['error' => 'sifront not found'], 404);
    }

    $activeId = (string) setting_get('active_sifront_id', '');

    json_response([
        'sifront' => [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'content' => (string) $row['content'],
            'version' => (string) $row['version'],
            'meta' => json_decode((string) $row['meta'], true),
            'is_active' => (string) $row['id'] === $activeId,
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ],
    ]);
}

function api_sifronts_create(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('settings.manage');

    $body = read_json_body();
    $errors = [];

    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '') {
        $errors['name'] = ['name is required'];
    } elseif (mb_strlen($name) > 100) {
        $errors['name'] = ['must be at most 100 characters'];
    }

    $content = (string) ($body['content'] ?? '');
    $meta = isset($body['meta']) ? json_encode($body['meta']) : '{}';

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    $stmt = db()->prepare(
        'INSERT INTO sifronts (name, content, meta, version) VALUES (?, ?, ?, 1)'
    );
    $stmt->execute([$name, $content, $meta]);
    $id = (int) db()->lastInsertId();

    json_response([
        'sifront' => [
            'id' => $id,
            'name' => $name,
            'content' => $content,
            'version' => '1',
            'meta' => json_decode($meta, true),
            'is_active' => false,
            'created_at' => date('Y-m-d H:i:s'),
            'updated_at' => date('Y-m-d H:i:s'),
        ],
    ]);
}

function api_sifronts_update(string $method): never
{
    if ($method !== 'PATCH') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('settings.manage');

    $body = read_json_body();
    $id = (int) ($body['id'] ?? 0);

    if ($id <= 0) {
        json_response(['error' => 'id is required'], 422);
    }

    $stmt = db()->prepare('SELECT id FROM sifronts WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->fetch() === false) {
        json_response(['error' => 'sifront not found'], 404);
    }

    $sets = [];
    $errors = [];

    if (array_key_exists('name', $body)) {
        $name = trim((string) $body['name']);
        if ($name === '') {
            $errors['name'] = ['name is required'];
        } elseif (mb_strlen($name) > 100) {
            $errors['name'] = ['must be at most 100 characters'];
        } else {
            $sets['name'] = $name;
        }
    }

    if (array_key_exists('content', $body)) {
        $sets['content'] = (string) $body['content'];
    }

    if (array_key_exists('meta', $body)) {
        $sets['meta'] = json_encode($body['meta']);
    }

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    if ($sets === []) {
        json_response(['error' => 'nothing to update'], 422);
    }

    $sets['version'] = 'version + 1';
    $sets['updated_at'] = "datetime('now')";

    $setClauses = [];
    $params = [];
    foreach ($sets as $key => $value) {
        if ($key === 'version' || $key === 'updated_at') {
            $setClauses[] = $key . ' = ' . $value;
        } else {
            $setClauses[] = $key . ' = ?';
            $params[] = $value;
        }
    }
    $params[] = $id;

    db()->prepare(
        'UPDATE sifronts SET ' . implode(', ', $setClauses) . ' WHERE id = ?'
    )->execute($params);

    $stmt = db()->prepare('SELECT * FROM sifronts WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    $activeId = (string) setting_get('active_sifront_id', '');

    json_response([
        'sifront' => [
            'id' => (int) $row['id'],
            'name' => (string) $row['name'],
            'content' => (string) $row['content'],
            'version' => (string) $row['version'],
            'meta' => json_decode((string) $row['meta'], true),
            'is_active' => (string) $row['id'] === $activeId,
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ],
    ]);
}

function api_sifronts_delete(string $method): never
{
    if ($method !== 'DELETE') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('settings.manage');

    $id = (int) request_param('id', '0');

    if ($id <= 0) {
        json_response(['error' => 'id is required'], 422);
    }

    $activeId = (string) setting_get('active_sifront_id', '');
    if ((string) $id === $activeId) {
        json_response(['error' => 'cannot delete the active sifront'], 422);
    }

    $stmt = db()->prepare('DELETE FROM sifronts WHERE id = ?');
    $stmt->execute([$id]);

    if ($stmt->rowCount() === 0) {
        json_response(['error' => 'sifront not found'], 404);
    }

    json_response(['ok' => true]);
}

function api_sifronts_activate(string $method): never
{
    if ($method !== 'POST') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('settings.manage');

    $body = read_json_body();
    $id = (int) ($body['id'] ?? 0);

    if ($id <= 0) {
        json_response(['error' => 'id is required'], 422);
    }

    $stmt = db()->prepare('SELECT id FROM sifronts WHERE id = ?');
    $stmt->execute([$id]);
    if ($stmt->fetch() === false) {
        json_response(['error' => 'sifront not found'], 404);
    }

    setting_set('active_sifront_id', (string) $id);

    json_response(['ok' => true, 'active_sifront_id' => $id]);
}

/* ------------------------------------------------------------------ */
/* Router                                                             */
/* ------------------------------------------------------------------ */

function handle_api(string $action, string $method): never
{
    /*
     * While migrations are pending, the schema does not exist yet
     * (no sessions/users tables), so any auth lookup would fatal.
     * Serve only system.status and answer everything else with 503,
     * WITHOUT ever resolving the current user.
     */
    if (db_needs_migration()) {
        if ($action === 'system.status') {
            api_system_status($method);
        }

        $v = db_version();
        json_response([
            'error' => 'migration_required',
            'version' => $v['applied'],
            'latest' => $v['latest'],
        ], 503);
    }

    $public = [
        'index',
        'auth.login',
        'auth.me',
        'system.status',
        'settings.get',
        'tracking.get',
        'pages.list',
        'pages.get',
        'pages.search',
        'tags.list',
        'kvs.list',
        'kvs.get',
        'kvs.batchGet',
    ];

    if (!in_array($action, $public, true)) {
        require_auth();
    }

    $user = current_user();

    if ($user !== null && $user['must_change_password']
        && !in_array($action, ['auth.changePassword', 'auth.logout', 'auth.me'], true)) {
        json_response(['error' => 'password_change_required'], 403);
    }

    switch ($action) {
        case '':
        case 'index':
            json_response([
                'name' => APP_NAME,
                'status' => 'ok',
                'api' => true,
                'actions' => [
                    'auth.login', 'auth.logout', 'auth.me', 'auth.changePassword',
                    'auth.profile', 'auth.avatar',
                    'system.status',
                    'settings.get', 'settings.update',
                    'tracking.get', 'tracking.update',
                    'pages.list', 'pages.get', 'pages.create', 'pages.update',
                    'pages.delete', 'pages.search', 'pages.grants', 'pages.grant',
                    'pages.revokeGrant',
                    'users.list', 'users.create', 'users.update', 'users.setRoles',
                    'roles.list', 'tags.list',
                    'assets.list', 'assets.get', 'assets.create', 'assets.update',
                    'assets.delete',
                    'kvs.list', 'kvs.get', 'kvs.create', 'kvs.update', 'kvs.delete',
                    'kvs.grants', 'kvs.grant', 'kvs.revokeGrant',
                    'sifronts.list', 'sifronts.get', 'sifronts.create', 'sifronts.update',
                    'sifronts.delete', 'sifronts.activate',
                ],
            ]);

        case 'auth.login':
            api_auth_login($method);

        case 'auth.logout':
            api_auth_logout($method);

        case 'auth.me':
            api_auth_me($method);

        case 'auth.changePassword':
            api_auth_change_password($method);

        case 'auth.profile':
            api_auth_profile($method);

        case 'auth.avatar':
            api_auth_avatar($method);

        case 'system.status':
            api_system_status($method);

        case 'settings.get':
            api_settings_get($method);

        case 'settings.update':
            api_settings_update($method);

        case 'tracking.get':
            api_tracking_get($method);

        case 'tracking.update':
            api_tracking_update($method);

        case 'pages.list':
            api_pages_list($method);

        case 'pages.get':
            api_pages_get($method);

        case 'pages.create':
            api_pages_create($method);

        case 'pages.update':
            api_pages_update($method);

        case 'pages.delete':
            api_pages_delete($method);

        case 'pages.search':
            api_pages_search($method);

        case 'pages.grants':
            api_pages_grants($method);

        case 'pages.grant':
            api_pages_grant($method);

        case 'pages.revokeGrant':
            api_pages_revoke_grant($method);

        case 'users.list':
            api_users_list($method);

        case 'users.create':
            api_users_create($method);

        case 'users.update':
            api_users_update($method);

        case 'users.setRoles':
            api_users_set_roles($method);

        case 'roles.list':
            api_roles_list($method);

        case 'tags.list':
            api_tags_list($method);

        case 'assets.list':
            api_assets_list($method);

        case 'assets.get':
            api_assets_get($method);

        case 'assets.create':
            api_assets_create($method);

        case 'assets.update':
            api_assets_update($method);

        case 'assets.delete':
            api_assets_delete($method);

        case 'kvs.list':
            api_kvs_list($method);

        case 'kvs.get':
            api_kvs_get($method);

        case 'kvs.batchGet':
            api_kvs_batch_get($method);

        case 'kvs.create':
            api_kvs_create($method);

        case 'kvs.update':
            api_kvs_update($method);

        case 'kvs.delete':
            api_kvs_delete($method);

        case 'kvs.grants':
            api_kvs_grants($method);

        case 'kvs.grant':
            api_kvs_grant($method);

        case 'kvs.revokeGrant':
            api_kvs_revoke_grant($method);

        case 'sifronts.list':
            api_sifronts_list($method);

        case 'sifronts.get':
            api_sifronts_get($method);

        case 'sifronts.create':
            api_sifronts_create($method);

        case 'sifronts.update':
            api_sifronts_update($method);

        case 'sifronts.delete':
            api_sifronts_delete($method);

        case 'sifronts.activate':
            api_sifronts_activate($method);

        default:
            json_response(['error' => 'Unknown API action'], 404);
    }
}
