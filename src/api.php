/**
 * ------------------------------------------------------------
 * API
 *
 * Protocol:
 *   ?module=api&action=auth.login
 *   ?module=api&action=pages.list
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

    $stmt = db()->prepare('SELECT * FROM users WHERE username = :u AND is_active = 1');
    $stmt->execute(['u' => $username]);
    $row = $stmt->fetch();

    if ($row === false || !password_verify($password, $row['password_hash'])) {
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
    ]);
}

function api_pages_list(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('pages.read');

    $q = request_param('q');

    if ($q !== null && trim($q) !== '') {
        json_response(search_pages(trim($q), api_status_param()));
    }

    $status = api_status_param();
    $page = max(1, (int) request_param('page', '1'));
    $perPage = min(100, max(1, (int) request_param('per_page', '20')));
    $tag = request_param('tag');

    if ($tag !== null && trim($tag) !== '') {
        $where = '';
        $params = [];

        if ($status !== null) {
            $where = 'WHERE p.status = :status';
            $params['status'] = $status;
        }

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

    $where = '';
    $params = [];

    if ($status !== null) {
        $where = 'WHERE p.status = :status';
        $params['status'] = $status;
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

    if ($status === null) {
        return null;
    }

    if (!in_array($status, ['draft', 'published'], true)) {
        json_response(['error' => 'invalid status'], 422);
    }

    return $status;
}

function api_pages_get(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('pages.read');

    $id = (int) request_param('id', '0');
    $slug = request_param('slug');
    $page = fetch_page($id, $slug);

    if ($page === null) {
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

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    $stmt = db()->prepare('SELECT 1 FROM pages WHERE slug = ?');
    $stmt->execute([$slug]);
    if ($stmt->fetch() !== false) {
        json_response(['error' => 'slug already exists'], 409);
    }

    $stmt = db()->prepare(
        'INSERT INTO pages (slug, title, content_md, status, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([$slug, $title, $content, $status, $user['id'], $user['id']]);

    json_response(['page' => page_payload(fetch_page((int) db()->lastInsertId()))], 201);
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

    if ($errors !== []) {
        json_response(['error' => 'validation failed', 'errors' => $errors], 422);
    }

    if ($sets === []) {
        json_response(['page' => page_payload($page)]);
    }

    $sets[] = 'updated_by = :uid';
    $sets[] = 'updated_at = datetime(\'now\')';
    $params['uid'] = current_user()['id'];
    $params['id'] = $id;

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

    $stmt = db()->prepare('DELETE FROM pages WHERE id = ?');
    $stmt->execute([$id]);

    json_response(['ok' => true]);
}

function api_pages_search(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    require_permission('pages.read');
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
        'SELECT u.username, u.name, gu.name AS granted_by_name, g.created_at
           FROM page_grants g
           JOIN users u ON u.id = g.user_id
           LEFT JOIN users gu ON gu.id = g.granted_by
          WHERE g.page_id = ?
          ORDER BY u.username'
    );
    $stmt->execute([$page['id']]);

    json_response(['grants' => $stmt->fetchAll()]);
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

    if (!can((int) $targetId, 'pages.write')) {
        json_response(['error' => 'user lacks pages.write permission'], 422);
    }

    $stmt = db()->prepare('INSERT OR IGNORE INTO page_grants (page_id, user_id, granted_by) VALUES (?, ?, ?)');
    $stmt->execute([$page['id'], (int) $targetId, $user['id']]);

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
           FROM users ORDER BY id'
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

    if ($email !== null && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $errors['email'] = ['invalid email'];
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
        } else {
            $stmt = db()->prepare('SELECT 1 FROM users WHERE email = ? AND id <> ?');
            $stmt->execute([$email, $id]);
            if ($stmt->fetch() !== false) {
                $errors['email'] = ['already exists'];
            } else {
                $sets[] = 'email = :email';
                $params['email'] = $email;
            }
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

    require_permission('pages.read');

    $counts = [];

    foreach (db()->query('SELECT content_md FROM pages')->fetchAll() as $row) {
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
/* Shared helpers                                                     */
/* ------------------------------------------------------------------ */

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
/* Router                                                             */
/* ------------------------------------------------------------------ */

function handle_api(string $action, string $method): never
{
    if (db_needs_migration() && $action !== 'system.status') {
        $v = db_version();
        json_response([
            'error' => 'migration_required',
            'version' => $v['applied'],
            'latest' => $v['latest'],
        ], 503);
    }

    $public = ['index', 'auth.login', 'auth.me', 'system.status'];

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
                    'system.status',
                    'pages.list', 'pages.get', 'pages.create', 'pages.update',
                    'pages.delete', 'pages.search', 'pages.grants', 'pages.grant',
                    'pages.revokeGrant',
                    'users.list', 'users.create', 'users.update', 'users.setRoles',
                    'roles.list', 'tags.list',
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

        case 'system.status':
            api_system_status($method);

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

        default:
            json_response(['error' => 'Unknown API action'], 404);
    }
}
