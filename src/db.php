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
 *      directory — dev sets it to ./var/single-php);
 *   2. <DOCUMENT_ROOT>/../single-php  (production default);
 *   3. <artifact dir>/var/single-php  (CLI/fallback when no web root).
 */
function db_dir(): string
{
    $env = getenv('APP_DB_DIR');

    if ($env !== false && $env !== '') {
        return rtrim($env, '/\\');
    }

    $webRoot = (string) ($_SERVER['DOCUMENT_ROOT'] ?? '');

    if ($webRoot !== '') {
        return rtrim($webRoot, '/\\') . '/../single-php';
    }

    return dirname(__FILE__) . '/var/single-php';
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
    $permissions = ['pages.read', 'pages.write', 'pages.delete', 'users.manage', 'roles.manage'];

    $roles = [
        'admin'  => ['name' => 'Admin',  'permissions' => null],
        'editor' => ['name' => 'Editor', 'permissions' => ['pages.read', 'pages.write', 'pages.delete']],
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
 * Idempotent default-admin bootstrap: only when the users table is empty.
 * Credentials default to admin / admin123 and can be overridden with the
 * ADMIN_PASSWORD env var. The account is flagged must_change_password so
 * the app blocks until the operator changes it.
 */
function seed_default_admin(): void
{
    $pdo = db();

    if ((int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() > 0) {
        return;
    }

    $password = getenv('ADMIN_PASSWORD');

    if ($password === false || $password === '') {
        $password = 'admin123';
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
