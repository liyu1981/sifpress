/**
 * ------------------------------------------------------------
 * Database
 *
 * SQLite + FTS5 in WAL mode. A _migrations table records applied
 * schema versions; bootstrap only *detects* pending migrations and
 * they are applied on demand via ?module=migration (src/migration.php).
 * ------------------------------------------------------------
 */

/**
 * The folder holding the SQLite database. Order of precedence:
 *
 *   1. APP_DB_DIR env var (absolute, or relative to the working
 *      directory — dev sets it to ./var/sifpress);
 *   2. <DOCUMENT_ROOT>/../sifpress  (production default);
 *   3. <artifact dir>/var/sifpress  (CLI/fallback when no web root).
 */
function db_dir(): string
{
    $env = getenv('APP_DB_DIR');

    if ($env !== false && $env !== '') {
        return rtrim($env, '/\\');
    }

    $webRoot = (string) ($_SERVER['DOCUMENT_ROOT'] ?? '');

    if ($webRoot !== '') {
        return rtrim($webRoot, '/\\') . '/../sifpress';
    }

    return dirname(__FILE__) . '/var/sifpress';
}

/**
 * Resolve the SQLite database file path (the DB file is always sys.db
 * inside the folder). Creates the folder if missing.
 */
function db_path(): string
{
    $dir = db_dir();

    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }

    return $dir . '/sys.db';
}

/**
 * Single shared PDO connection per request. Opens the DB, applies the
 * WAL/consistency pragmas, and ensures the _migrations bookkeeping
 * table exists. Does NOT run migrations.
 */
function db(): PDO
{
    static $pdo = null;

    if ($pdo === null) {
        $pdo = new PDO('sqlite:' . db_path());
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
        $pdo->exec('PRAGMA journal_mode = WAL');
        $pdo->exec('PRAGMA synchronous = NORMAL');
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA busy_timeout = 5000');
        $pdo->exec('CREATE TABLE IF NOT EXISTS _migrations (
            version    TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL DEFAULT (datetime(\'now\'))
        )');
    }

    return $pdo;
}

/**
 * Applied and latest schema versions, both in filename order.
 */
function db_version(): array
{
    $applied = db()->query('SELECT version FROM _migrations')
        ->fetchAll(PDO::FETCH_COLUMN);
    $latest = array_keys(MIGRATIONS);

    return ['applied' => $applied, 'latest' => $latest];
}

/**
 * True when pending migrations exist. When true, the app enters
 * migration-needed mode (503 for the API, maintenance hint for the SPA).
 */
function db_needs_migration(): bool
{
    $v = db_version();

    return $v['applied'] !== $v['latest'];
}

/**
 * Apply every pending migration in filename order. Each migration runs
 * inside its own BEGIN IMMEDIATE transaction (write lock up front, so
 * concurrent requests cannot race). Returns the versions applied.
 */
function db_migrate(): array
{
    $pdo = db();
    $applied = db_version()['applied'];
    $done = [];

    foreach (array_keys(MIGRATIONS) as $version) {
        if (in_array($version, $applied, true)) {
            continue;
        }

        $pdo->exec('BEGIN IMMEDIATE');

        try {
            $pdo->exec(MIGRATIONS[$version]);
            $stmt = $pdo->prepare('INSERT INTO _migrations (version) VALUES (?)');
            $stmt->execute([$version]);
            $pdo->exec('COMMIT');
            $done[] = $version;
        } catch (Throwable $e) {
            $pdo->exec('ROLLBACK');
            throw $e;
        }
    }

    return $done;
}

/**
 * Idempotent RBAC seeding: default permissions, roles, and role->permission
 * links. Admin is linked to every current permission (and future ones, on
 * later seed runs).
 */
function seed_rbac(): void
{
    $pdo = db();
    $permissions = [
        'pages.read',
        'pages.write',
        'pages.delete',
        'users.manage',
        'roles.manage',
        'assets.upload',
        'settings.manage',
    ];

    $roles = [
        'admin'  => ['name' => 'Admin',  'permissions' => null],
        'editor' => [
            'name' => 'Editor',
            'permissions' => ['pages.read', 'pages.write', 'pages.delete', 'assets.upload'],
        ],
        'viewer' => ['name' => 'Viewer', 'permissions' => ['pages.read']],
    ];

    $insPerm = $pdo->prepare('INSERT OR IGNORE INTO permissions (code) VALUES (?)');
    foreach ($permissions as $code) {
        $insPerm->execute([$code]);
    }

    $permIds = [];
    foreach ($pdo->query('SELECT id, code FROM permissions') as $row) {
        $permIds[$row['code']] = (int) $row['id'];
    }

    $insRole = $pdo->prepare('INSERT OR IGNORE INTO roles (code, name, description) VALUES (?, ?, ?)');
    foreach ($roles as $code => $def) {
        $insRole->execute([$code, $def['name'], $def['name']]);
    }

    $roleIds = [];
    foreach ($pdo->query('SELECT id, code FROM roles') as $row) {
        $roleIds[$row['code']] = (int) $row['id'];
    }

    $link = $pdo->prepare('INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)');
    foreach ($roles as $code => $def) {
        $rid = $roleIds[$code];

        if ($def['permissions'] === null) {
            foreach (array_values($permIds) as $pid) {
                $link->execute([$rid, $pid]);
            }
        } else {
            foreach ($def['permissions'] as $pcode) {
                $link->execute([$rid, $permIds[$pcode]]);
            }
        }
    }
}

/**
 * Idempotent default-favicon seed: inserts a "Shifu" SVG into the assets
 * table and links it as the site favicon + apple-touch-icon. Runs once;
 * subsequent calls are no-ops.
 */
function seed_favicon(): void
{
    $pdo = db();

    $svg = '<svg xmlns="http://w3.org" viewBox="0 0 180 180"><circle cx="90" cy="90" r="84" fill="#cfd8dc"/><g fill="#1e293b"><circle cx="90" cy="24.6" r="12.3"/><path d="M81.2 33.4h17.6l8.8 12.3H72.4Z"/><path d="M90 43.9c-31.3 0-42.2 22.2-42.2 44 0 10.9 4.6 17.6 8.8 22.1-2.1-17.5 8.8-41.8 33.4-41.8s35.5 24.3 33.4 41.8c4.2-4.5 8.8-11.2 8.8-22.1 0-21.8-10.9-44-42.2-44"/></g><path d="M78 33.8q12 2.8 24 0" fill="none" stroke="#dc2626" stroke-width="4.2" stroke-linecap="round"/><g fill="none" stroke="#2563eb" stroke-linecap="round"><path d="M63.3 86.1q8.8-4.5 17.6 0m35.8 0q-8.8-4.5-17.6 0" stroke-width="3.5"/><path d="M90 81.6v13.3" stroke-width="2.8"/></g><g fill="#b45309"><path d="M90 100.2c-7 1.8-28.8 7.4-42.2 25 17.6-4.3 37.3-13.1 42.2-20.4Z"/><path d="M90 100.2c7 1.8 28.8 7.4 42.2 25-17.6-4.3-37.3-13.1-42.2-20.4ZM84.7 116l5.3 38.7 5.3-38.7Z"/></g></svg>';

    $check = $pdo->query("SELECT value FROM settings WHERE key = 'favicon_asset_id'")->fetch();
    $existingId = ($check !== false && (string) $check['value'] !== '') ? (int) $check['value'] : 0;

    if ($existingId > 0) {
        $row = $pdo->prepare('SELECT data FROM assets WHERE id = ?');
        $row->execute([$existingId]);
        $current = $row->fetchColumn();

        if ($current !== false && $current === $svg) {
            return;
        }

        $stmt = $pdo->prepare(
            'UPDATE assets SET data = ?, size_bytes = ?, name = ?, mime = ? WHERE id = ?'
        );
        $stmt->execute([$svg, strlen($svg), 'default-favicon.svg', 'image/svg+xml', $existingId]);
        $id = $existingId;
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO assets (name, mime, kind, size_bytes, data, is_public) VALUES (?, ?, ?, ?, ?, 1)'
        );
        $stmt->execute(['default-favicon.svg', 'image/svg+xml', 'image', strlen($svg), $svg]);
        $id = (int) $pdo->lastInsertId();

        $pdo->prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'favicon_asset_id'")
            ->execute([(string) $id]);
        $pdo->prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'apple_touch_icon_asset_id'")
            ->execute([(string) $id]);
    }

    $pdo->prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'favicon_version'")
        ->execute([(string) time()]);
    $pdo->prepare("UPDATE settings SET value = ?, updated_at = datetime('now') WHERE key = 'favicon_mime'")
        ->execute(['image/svg+xml']);
}

/**
 * Idempotent default-admin bootstrap: only when the users table is empty.
 * Credentials default to admin / admin and can be overridden with the
 * ADMIN_PASSWORD env var. The account is flagged must_change_password so
 * the app blocks until the operator changes it.
 */
function seed_default_admin(): void
{
    $pdo = db();

    // The _guest_ user is seeded by a migration, so "no users" must mean
    // no real (login-capable) user.
    $count = (int) $pdo->query(
        "SELECT COUNT(*) FROM users WHERE username <> '_guest_'"
    )->fetchColumn();

    if ($count > 0) {
        return;
    }

    $password = getenv('ADMIN_PASSWORD');

    if ($password === false || $password === '') {
        $password = 'admin';
    }

    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO users (username, name, password_hash, must_change_password) VALUES (?, ?, ?, 1)'
        );
        $stmt->execute(['admin', 'Administrator', password_hash($password, PASSWORD_DEFAULT)]);
        $userId = (int) $pdo->lastInsertId();

        $adminRoleId = $pdo->query("SELECT id FROM roles WHERE code = 'admin'")->fetchColumn();
        $link = $pdo->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)');
        $link->execute([$userId, (int) $adminRoleId]);

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}
