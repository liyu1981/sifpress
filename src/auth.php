/**
 * ------------------------------------------------------------
 * Authentication & RBAC
 *
 * DB-backed sessions (hashed token cookies), password hashing,
 * role/permission checks, and ownership-aware page grants.
 * ------------------------------------------------------------
 */

/**
 * Whether the request is over HTTPS (drives the generated base URL and the
 * Secure cookie flag).
 *
 * TLS-terminating proxies (Cloudflare, nginx, ELB, …) make PHP see plain HTTP,
 * so the original scheme arrives in forwarding headers. Without these the
 * artifact builds http:// links on an https page (mixed content, blocked) and
 * skips the Secure cookie flag.
 */
function is_https(): bool
{
    $https = $_SERVER['HTTPS'] ?? '';

    if (is_string($https) && $https !== '' && strtolower($https) !== 'off') {
        return true;
    }

    if ((int) ($_SERVER['SERVER_PORT'] ?? 0) === 443) {
        return true;
    }

    // X-Forwarded-Proto may be a comma-separated list; the first entry is the
    // scheme the client used.
    $proto = $_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '';

    if (is_string($proto) && $proto !== '') {
        $first = strtolower(trim(explode(',', $proto)[0]));

        if ($first === 'https') {
            return true;
        }
    }

    foreach (['HTTP_X_FORWARDED_SSL', 'HTTP_FRONT_END_HTTPS'] as $key) {
        $value = $_SERVER[$key] ?? '';

        if (is_string($value) && strtolower(trim($value)) === 'on') {
            return true;
        }
    }

    $scheme = $_SERVER['HTTP_X_FORWARDED_SCHEME'] ?? '';

    if (is_string($scheme) && strtolower(trim($scheme)) === 'https') {
        return true;
    }

    // Cloudflare also mirrors the scheme in CF-Visitor ({"scheme":"https"}).
    $cf = $_SERVER['HTTP_CF_VISITOR'] ?? '';

    if (is_string($cf) && str_contains(strtolower($cf), '"scheme":"https"')) {
        return true;
    }

    return false;
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
 *
 * A live session slides its idle window forward (rate-limited to one write
 * per hour) and dies at the absolute ceiling no matter how active it is.
 */
function lookup_session(string $token): ?array
{
    $hash = hash('sha256', $token);

    $stmt = db()->prepare(
        'SELECT u.id, u.username, u.email, u.name, u.must_change_password,
                u.is_active, u.created_at, u.updated_at, s.created_at AS session_created_at
           FROM sessions s
           JOIN users u ON u.id = s.user_id
          WHERE s.token_hash = :h
            AND s.expires_at > datetime(\'now\')
            AND u.is_active = 1'
    );
    $stmt->execute(['h' => $hash]);
    $row = $stmt->fetch();

    if ($row === false) {
        return null;
    }

    $sessionCreatedAt = (string) $row['session_created_at'];
    unset($row['session_created_at']);
    touch_session($hash, $sessionCreatedAt);

    return $row;
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

/*
 * Session policy. Two independent windows bound a session's life:
 *
 *   SESSION_IDLE_TTL     no authenticated request for this long and the
 *                        session is dead (the window slides on use).
 *   SESSION_ABSOLUTE_TTL the hard ceiling, counted from sign-in; activity can
 *                        never push a session past it.
 *
 * Plus SESSION_MAX_PER_USER, so a shared or scripted credential cannot
 * accumulate unbounded sessions. Each value can be overridden from
 * sifpress_config.php with the matching SIFPRESS_* define.
 */
if (!defined('SESSION_IDLE_TTL')) {
    define('SESSION_IDLE_TTL', max(60, (int) (defined('SIFPRESS_SESSION_IDLE_TTL') ? SIFPRESS_SESSION_IDLE_TTL : 12 * 3600)));
}

if (!defined('SESSION_ABSOLUTE_TTL')) {
    define('SESSION_ABSOLUTE_TTL', max(SESSION_IDLE_TTL, (int) (defined('SIFPRESS_SESSION_ABSOLUTE_TTL') ? SIFPRESS_SESSION_ABSOLUTE_TTL : 7 * 86400)));
}

if (!defined('SESSION_MAX_PER_USER')) {
    define('SESSION_MAX_PER_USER', max(1, (int) (defined('SIFPRESS_SESSION_MAX_PER_USER') ? SIFPRESS_SESSION_MAX_PER_USER : 5)));
}

/* The sliding refresh only writes once per session per hour. */
if (!defined('SESSION_TOUCH_INTERVAL')) {
    define('SESSION_TOUCH_INTERVAL', 3600);
}

/*
 * Login throttle: LOGIN_MAX_FAILURES failures inside LOGIN_LOCK_WINDOW lock the
 * key out for that window, doubling with every further burst up to
 * LOGIN_LOCK_MAX. See login_throttle_check().
 */
if (!defined('LOGIN_MAX_FAILURES')) {
    define('LOGIN_MAX_FAILURES', max(1, (int) (defined('SIFPRESS_LOGIN_MAX_FAILURES') ? SIFPRESS_LOGIN_MAX_FAILURES : 5)));
}

/*
 * The IP key gets a far higher ceiling than the account key: a shared
 * connection (office NAT, mobile carrier, a dev machine) would otherwise let
 * one person's typos lock everyone else out. Spray attacks still hit it.
 */
if (!defined('LOGIN_IP_MAX_FAILURES')) {
    define('LOGIN_IP_MAX_FAILURES', max(LOGIN_MAX_FAILURES, (int) (defined('SIFPRESS_LOGIN_IP_MAX_FAILURES') ? SIFPRESS_LOGIN_IP_MAX_FAILURES : 20)));
}

if (!defined('LOGIN_LOCK_WINDOW')) {
    define('LOGIN_LOCK_WINDOW', max(60, (int) (defined('SIFPRESS_LOGIN_LOCK_WINDOW') ? SIFPRESS_LOGIN_LOCK_WINDOW : 900)));
}

if (!defined('LOGIN_LOCK_MAX')) {
    define('LOGIN_LOCK_MAX', 86400);
}

/* How long failed-attempt rows are kept for auditing. */
if (!defined('LOGIN_ATTEMPT_RETENTION')) {
    define('LOGIN_ATTEMPT_RETENTION', 30 * 86400);
}

/*
 * A real bcrypt hash (default cost) of a random throwaway string.
 * password_verify() is run against it when the submitted username does not
 * exist, so a miss costs the same wall-clock time as a wrong password and
 * cannot be told apart by timing. Keep the cost in step with
 * PASSWORD_DEFAULT's bcrypt cost, or the two paths diverge again.
 */
const AUTH_DUMMY_HASH = '$2y$10$0wHi8AGBbcGNTPUE8Yf3venrwTsinr63jH4R6YNk4C0.dblvkWXCC';

/**
 * UTC "now" in SQLite's datetime('now') format. Session timestamps are
 * compared against SQLite's UTC clock, so they must be written in UTC too —
 * writing them with the local PHP timezone silently extends every session on
 * a non-UTC host.
 */
function sql_now(): string
{
    return gmdate('Y-m-d H:i:s');
}

/**
 * Create a session for the user: random token, hashed in the DB, set as
 * an HttpOnly SameSite=Lax cookie. Returns the raw token (the only time it
 * exists un-hashed) so callers can revoke the session they are replacing.
 */
function create_session(int $userId): string
{
    $token = bin2hex(random_bytes(32));
    $now = sql_now();

    $stmt = db()->prepare(
        'INSERT INTO sessions (token_hash, user_id, expires_at, created_at, last_seen_at, ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        hash('sha256', $token),
        $userId,
        gmdate('Y-m-d H:i:s', time() + SESSION_IDLE_TTL),
        $now,
        $now,
        (string) ($_SERVER['REMOTE_ADDR'] ?? ''),
        substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
    ]);

    purge_sessions();
    prune_user_sessions($userId);

    setcookie('session', $token, [
        'expires' => time() + SESSION_ABSOLUTE_TTL,
        'path' => cookie_path(),
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https(),
    ]);

    return $token;
}

/**
 * Delete every session of a user except the one holding $keepToken (pass the
 * raw cookie value, or null to revoke them all). Used after a password change
 * so a stolen cookie dies with the password it was issued under.
 */
function revoke_sessions(int $userId, ?string $keepToken = null): int
{
    $sql = 'DELETE FROM sessions WHERE user_id = ?';
    $params = [$userId];

    if ($keepToken !== null && $keepToken !== '') {
        $sql .= ' AND token_hash <> ?';
        $params[] = hash('sha256', $keepToken);
    }

    $stmt = db()->prepare($sql);
    $stmt->execute($params);

    return $stmt->rowCount();
}

/**
 * The two throttle keys for a sign-in attempt: the account being targeted and
 * the source address. Both are checked, so one account cannot be ground down
 * from many IPs, and one IP cannot spray many accounts. Returns a list of
 * [sql expression, value, max failures] triples.
 */
function login_throttle_keys(string $username, string $ip): array
{
    return [
        ['lower(username)', strtolower($username), LOGIN_MAX_FAILURES],
        ['ip', $ip, LOGIN_IP_MAX_FAILURES],
    ];
}

/**
 * Throttle state for one key: ['locked' => bool, 'retry_after' => seconds].
 *
 * Failures are counted over the last 24 hours, ignoring anything that predates
 * the last *successful* attempt on the same key (so signing in clears the
 * slate without erasing the audit rows). Once LOGIN_MAX_FAILURES is reached
 * the key locks from the start of that burst for LOGIN_LOCK_WINDOW, doubling
 * for every additional burst of LOGIN_MAX_FAILURES up to LOGIN_LOCK_MAX — a
 * patient attacker is throttled exponentially instead of retrying forever at
 * a fixed rate.
 */
function login_throttle_state(string $column, string $value, int $maxFailures): array
{
    $stmt = db()->prepare(
        "SELECT COUNT(*) FROM login_attempts
          WHERE ok = 0 AND {$column} = :value
            AND created_at > datetime('now', '-24 hours')
            AND created_at > COALESCE(
                (SELECT MAX(created_at) FROM login_attempts
                  WHERE ok = 1 AND {$column} = :value), '')"
    );
    $stmt->execute(['value' => $value]);
    $failures = (int) $stmt->fetchColumn();

    if ($failures < $maxFailures) {
        return ['locked' => false, 'retry_after' => 0];
    }

    $bursts = intdiv($failures, $maxFailures) - 1;
    $lock = min(LOGIN_LOCK_WINDOW * (2 ** $bursts), LOGIN_LOCK_MAX);

    /*
     * The lock runs from the first failure of the burst that completed the
     * lockout, so the caller can be told when to retry instead of just "no".
     */
    $start = db()->prepare(
        "SELECT created_at FROM login_attempts
          WHERE ok = 0 AND {$column} = :value
          ORDER BY created_at ASC LIMIT 1 OFFSET :skip"
    );
    $start->execute(['value' => $value, 'skip' => ($bursts + 1) * $maxFailures - 1]);
    $first = $start->fetchColumn();

    if ($first === false) {
        return ['locked' => true, 'retry_after' => $lock];
    }

    $retry = strtotime((string) $first . ' UTC') + $lock - time();

    return ['locked' => $retry > 0, 'retry_after' => max(0, $retry)];
}

/**
 * Whether this sign-in attempt is locked out, taking the worst of the account
 * and IP keys. Returns ['locked' => bool, 'retry_after' => seconds].
 */
function login_throttle_check(string $username, string $ip): array
{
    $result = ['locked' => false, 'retry_after' => 0];

    foreach (login_throttle_keys($username, $ip) as [$column, $value, $maxFailures]) {
        $state = login_throttle_state($column, $value, $maxFailures);

        if ($state['locked']) {
            $result['locked'] = true;
            $result['retry_after'] = max($result['retry_after'], $state['retry_after']);
        }
    }

    return $result;
}

/**
 * Append a sign-in attempt to the audit log. Called for successes too, so the
 * table is a complete history rather than a failure-only counter.
 */
function login_attempt_record(string $username, string $ip, ?int $userId, bool $ok): void
{
    db()->prepare(
        'INSERT INTO login_attempts (username, ip, user_id, ok, user_agent)
         VALUES (?, ?, ?, ?, ?)'
    )->execute([
        substr($username, 0, 255),
        substr($ip, 0, 255),
        $userId,
        $ok ? 1 : 0,
        substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 255),
    ]);
}

/**
 * Keep only the newest SESSION_MAX_PER_USER sessions of a user, ordered by
 * recent activity. Runs on sign-in so the cap cannot be exceeded by simply
 * logging in again.
 */
function prune_user_sessions(int $userId): void
{
    db()->prepare(
        "DELETE FROM sessions
          WHERE user_id = ?
            AND token_hash NOT IN (
                SELECT token_hash FROM sessions
                 WHERE user_id = ?
                 ORDER BY datetime(last_seen_at) DESC, rowid DESC
                 LIMIT ?
            )"
    )->execute([$userId, $userId, SESSION_MAX_PER_USER]);
}

/**
 * Sweep expired sessions and stale login-attempt rows. Cheap enough to run on
 * every sign-in; the CLI (`sessions --purge`) is there for installs that want
 * it on a schedule instead.
 */
function purge_sessions(): void
{
    db()->exec('DELETE FROM sessions WHERE expires_at < datetime(\'now\')');
    db()->prepare('DELETE FROM login_attempts WHERE created_at < datetime(\'now\', ?)')->execute(['-' . LOGIN_ATTEMPT_RETENTION . ' seconds']);
}

/**
 * Slide a session's idle window forward, never past its absolute ceiling.
 * Called from lookup_session() but rate-limited to one write per session per
 * SESSION_TOUCH_INTERVAL seconds, so an active editor does not generate a
 * write on every request.
 */
function touch_session(string $tokenHash, string $createdAt): void
{
    $now = sql_now();
    $absolute = gmdate('Y-m-d H:i:s', strtotime($createdAt . ' UTC') + SESSION_ABSOLUTE_TTL);

    /* The absolute ceiling is not sliding: past it the session simply ends. */
    if ($now >= $absolute) {
        return;
    }

    $idleUntil = gmdate('Y-m-d H:i:s', time() + SESSION_IDLE_TTL);

    db()->prepare(
        'UPDATE sessions
            SET last_seen_at = :now,
                expires_at = :expires
          WHERE token_hash = :hash
            AND datetime(last_seen_at) <= datetime(:now, \'-' . SESSION_TOUCH_INTERVAL . ' seconds\')
            AND datetime(last_seen_at) >= datetime(:now, \'-' . SESSION_ABSOLUTE_TTL . ' seconds\')'
    )->execute([
        'now' => $now,
        'expires' => $idleUntil < $absolute ? $idleUntil : $absolute,
        'hash' => $tokenHash,
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
 * Distinct permission codes granted to a user (cached per request). Unions the
 * user's role permissions with any direct per-user grants.
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
        $codes = $stmt->fetchAll(PDO::FETCH_COLUMN);

        // Direct per-user grants on top of the role baseline.
        $stmt = db()->prepare(
            'SELECT p.code
               FROM user_permissions up
               JOIN permissions p ON p.id = up.permission_id
              WHERE up.user_id = ?'
        );
        $stmt->execute([$userId]);
        $codes = array_values(
            array_unique(array_merge($codes, $stmt->fetchAll(PDO::FETCH_COLUMN)))
        );

        $cache[$userId] = $codes;
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
 * Whether the user may edit an asset: admin, the uploader, or a user holding
 * an explicit asset grant. `$asset` is an assets row (needs `id`, `uploaded_by`).
 */
function can_edit_asset(?array $user, array $asset): bool
{
    if ($user === null) {
        return false;
    }

    if (is_admin($user)) {
        return true;
    }

    if ($asset['uploaded_by'] !== null && (int) $user['id'] === (int) $asset['uploaded_by']) {
        return true;
    }

    $stmt = db()->prepare('SELECT 1 FROM asset_grants WHERE asset_id = ? AND user_id = ?');
    $stmt->execute([(int) $asset['id'], (int) $user['id']]);

    return $stmt->fetch() !== false;
}

/**
 * Whether the user may view an asset: public assets are open to everyone,
 * private ones only to editors (owner / admin / grant).
 */
function can_view_asset(?array $user, array $asset): bool
{
    if ((bool) (int) $asset['is_public']) {
        return true;
    }

    return can_edit_asset($user, $asset);
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
        ? '?p=sifpress/asset&user=' . $userId
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
