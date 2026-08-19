/**
 * ------------------------------------------------------------
 * Authentication & RBAC
 *
 * DB-backed sessions (hashed token cookies), password hashing,
 * role/permission checks, and ownership-aware page grants.
 * ------------------------------------------------------------
 */

/**
 * Whether the request is over HTTPS (drives the Secure cookie flag).
 */
function is_https(): bool
{
    return (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (int) ($_SERVER['SERVER_PORT'] ?? 0) === 443;
}

/**
 * Cookie path scoped to the app's mount directory, so the same artifact
 * works at any depth without leaking the session cookie elsewhere.
 */
function cookie_path(): string
{
    $dir = dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php');

    return $dir === '/' || $dir === '\\' ? '/' : $dir . '/';
}

/**
 * Look up a session by its raw cookie token. The DB stores only a hash
 * of the token, so a leaked DB cannot mint sessions. Expired and
 * deactivated users never authenticate.
 */
function lookup_session(string $token): ?array
{
    $stmt = db()->prepare(
        'SELECT u.id, u.username, u.email, u.name, u.must_change_password,
                u.is_active, u.created_at, u.updated_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = :h
            AND s.expires_at > datetime(\'now\')
            AND u.is_active = 1'
    );
    $stmt->execute(['h' => hash('sha256', $token)]);
    $row = $stmt->fetch();

    return $row === false ? null : $row;
}

/**
 * The authenticated user for this request, or null. Cached per request.
 */
function current_user(): ?array
{
    static $user = false;

    if ($user === false) {
        $token = $_COOKIE['session'] ?? null;
        $user = $token === null ? null : lookup_session($token);
    }

    return $user;
}

/**
 * 401 unless a user is authenticated; returns the user row.
 */
function require_auth(): array
{
    $user = current_user();

    if ($user === null) {
        json_response(['error' => 'unauthorized'], 401);
    }

    return $user;
}

/**
 * Create a session for the user: random token, hashed in the DB, set as
 * an HttpOnly SameSite=Lax cookie. Opportunistically sweeps expired rows.
 */
function create_session(int $userId): void
{
    $token = bin2hex(random_bytes(32));

    $stmt = db()->prepare(
        'INSERT INTO sessions (token_hash, user_id, expires_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        hash('sha256', $token),
        $userId,
        date('Y-m-d H:i:s', time() + 30 * 86400),
        (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
    ]);

    db()->exec('DELETE FROM sessions WHERE expires_at < datetime(\'now\')');

    setcookie('session', $token, [
        'expires' => time() + 30 * 86400,
        'path' => cookie_path(),
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https(),
    ]);
}

/**
 * Invalidate the current session and clear the cookie.
 */
function destroy_session(): void
{
    $token = $_COOKIE['session'] ?? null;

    if ($token !== null) {
        $stmt = db()->prepare('DELETE FROM sessions WHERE token_hash = ?');
        $stmt->execute([hash('sha256', $token)]);
    }

    setcookie('session', '', [
        'expires' => time() - 3600,
        'path' => cookie_path(),
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https(),
    ]);
}

/**
 * Role codes granted to a user (cached per request).
 */
function user_roles_codes(int $userId): array
{
    static $cache = [];

    if (!isset($cache[$userId])) {
        $stmt = db()->prepare(
            'SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id
              WHERE ur.user_id = ?'
        );
        $stmt->execute([$userId]);
        $cache[$userId] = $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    return $cache[$userId];
}

/**
 * Distinct permission codes granted to a user (cached per request).
 */
function user_permission_codes(int $userId): array
{
    static $cache = [];

    if (!isset($cache[$userId])) {
        $stmt = db()->prepare(
            'SELECT DISTINCT p.code
               FROM user_roles ur
               JOIN role_permissions rp ON rp.role_id = ur.role_id
               JOIN permissions p ON p.id = rp.permission_id
              WHERE ur.user_id = ?'
        );
        $stmt->execute([$userId]);
        $cache[$userId] = $stmt->fetchAll(PDO::FETCH_COLUMN);
    }

    return $cache[$userId];
}

/**
 * Role-based permission check (never raises).
 */
function can(int $userId, string $permission): bool
{
    return in_array($permission, user_permission_codes($userId), true);
}

/**
 * Whether the user holds the admin role.
 */
function is_admin(array $user): bool
{
    return in_array('admin', user_roles_codes((int) $user['id']), true);
}

/**
 * 403 unless the user holds the given role permission.
 */
function require_permission(string $permission): void
{
    $user = require_auth();

    if (!can((int) $user['id'], $permission)) {
        json_response(['error' => 'forbidden', 'permission' => $permission], 403);
    }
}

/**
 * The id of the special `_guest_` user (anonymous visitors), or null if
 * it has not been seeded yet. Cached per request.
 */
function guest_user_id(): ?int
{
    static $id = false;

    if ($id === false) {
        $stmt = db()->prepare('SELECT id FROM users WHERE username = ?');
        $stmt->execute(['_guest_']);
        $id = $stmt->fetchColumn();
        $id = $id === false ? null : (int) $id;
    }

    return $id;
}

/**
 * Whether a page is visible to the given user (or null for the guest /
 * anonymous visitor). Admins and the owner always see it; otherwise the
 * user — or the _guest_ user, making the page public — must hold a
 * grant on the page.
 */
function can_view_page(?array $user, array $page): bool
{
    if ($user !== null && is_admin($user)) {
        return true;
    }

    if ($user !== null
        && $page['created_by'] !== null
        && (int) $user['id'] === (int) $page['created_by']) {
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
        'SELECT COUNT(*) FROM page_grants
          WHERE page_id = ? AND user_id IN (' . $placeholders . ')'
    );
    $stmt->execute(array_merge([(int) $page['id']], $ids));

    return (int) $stmt->fetchColumn() > 0;
}

/**
 * Ownership-aware edit check. Admin always wins; otherwise the user needs
 * the pages.write role AND must be the page author or hold an explicit
 * edit grant on the page.
 */
function can_edit_page(array $user, int $pageId): bool
{
    if (is_admin($user)) {
        return true;
    }

    if (!can((int) $user['id'], 'pages.write')) {
        return false;
    }

    $stmt = db()->prepare(
        'SELECT COUNT(*)
           FROM pages p
           LEFT JOIN page_grants g ON g.page_id = p.id AND g.user_id = :uid
          WHERE p.id = :pid
            AND (p.created_by = :uid2 OR (g.user_id IS NOT NULL AND g.permission = \'edit\'))'
    );
    $stmt->execute([
        'uid' => (int) $user['id'],
        'pid' => $pageId,
        'uid2' => (int) $user['id'],
    ]);

    return (int) $stmt->fetchColumn() > 0;
}

/**
 * 403 unless the current user may edit the given page row.
 */
function require_page_edit(array $page): void
{
    $user = require_auth();

    if (!can_edit_page($user, (int) $page['id'])) {
        json_response([
            'error' => 'forbidden',
            'reason' => 'not the author and no edit grant',
        ], 403);
    }
}

/**
 * Public user payload: identity fields, avatar, roles, and permission
 * codes. Never includes the password hash or the avatar blob.
 */
function user_payload(int $userId): array
{
    $stmt = db()->prepare(
        'SELECT id, username, email, name, must_change_password,
                avatar IS NOT NULL AS has_avatar, created_at, updated_at
           FROM users WHERE id = ?'
    );
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    if ($row === false) {
        json_response(['error' => 'user not found'], 404);
    }

    $row['has_avatar'] = (bool) (int) $row['has_avatar'];
    $row['avatar_url'] = $row['has_avatar']
        ? '?p=asset&user=' . $userId
        : generated_avatar_data_uri((string) $row['name'], (string) $row['email']);

    $row['roles'] = user_roles_codes($userId);
    $row['permissions'] = user_permission_codes($userId);

    return $row;
}

/**
 * Escape a user query into a safe FTS5 MATCH string: a quoted phrase with
 * a prefix wildcard. Short queries return '' (search yields no results
 * rather than an error).
 */
function build_match(string $q): string
{
    $q = trim($q);
    $q = (string) preg_replace('/[\x00-\x1F"]+/', '', $q);

    if ($q === '' || strlen($q) < 3) {
        return '';
    }

    return '"' . $q . '"*';
}
