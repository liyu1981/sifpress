/**
 * ------------------------------------------------------------
 * Database
 *
 * SQLite + FTS5 in WAL mode. A _migrations table records applied
 * schema versions; bootstrap only *detects* pending migrations and
 * they are applied on demand via ?p=sifpress/migration (src/migration.php).
 * ------------------------------------------------------------
 */

/**
 * The folder holding the SQLite database. Precedence:
 *
 *   1. SIFPRESS_DB_DIR constant (from sifpress_config.php)
 *   2. <DOCUMENT_ROOT>/../sifpress  (production default);
 *   3. <artifact dir>/var/sifpress  (CLI/fallback when no web root).
 */
function db_dir(): string
{
    if (defined('SIFPRESS_DB_DIR')) {
        return rtrim(SIFPRESS_DB_DIR, '/\\');
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
 * Apply pending migrations and run the idempotent seeds (RBAC, default admin,
 * favicon, default sifront) plus the theme-key normalization. Shared by the
 * web migration endpoint and the CLI.
 */
function db_migrate_and_seed(): array
{
    $applied = db_migrate();
    seed_rbac();
    seed_default_admin();
    seed_favicon();
    seed_default_sifront();
    db_housekeeping();

    return $applied;
}

/**
 * Idempotent data steps that are code, not SQL (see the marker migrations that
 * reach them): normalizing pre-split theme keys and dropping the asset BLOB
 * columns once they are empty. Run on every `migrate`, including when no
 * migration was pending — an operator who just finished `assets
 * migrate-blobs` should not need a new release to complete the cleanup.
 */
function db_housekeeping(): void
{
    normalize_sifront_copy_kv();
    drop_legacy_asset_blob_columns();
}

/**
 * Status of the phase-5 cleanup, for the CLI and `assets status` to report.
 * Pass an array to record the outcome of drop_legacy_asset_blob_columns().
 *
 * @param array{dropped:bool, reason:string, remaining:array<int,string>}|null $set
 *
 * @return array{dropped:bool, reason:string, remaining:array<int,string>}
 */
function asset_blob_column_status(?array $set = null): array
{
    static $status = null;

    if ($set !== null) {
        $status = $set;
    }

    return $status ?? [
        'dropped' => false,
        'reason' => 'not run yet',
        'remaining' => asset_blob_columns(),
    ];
}

/**
 * Drop `assets.data` and `assets.thumb` once they are empty (phase 5 of
 * plan/asset-storage-plan.md).
 *
 * Two guards, both deliberate:
 *
 * - **Never while a row still holds bytes.** A deployment that has not run
 *   `assets migrate-blobs` would lose every unmigrated asset the instant the
 *   column went away, so that case reports what to do and leaves the schema
 *   alone.
 * - **Only on SQLite >= 3.35**, which is when ALTER TABLE ... DROP COLUMN
 *   appeared. Older hosts keep two empty nullable columns; that costs nothing
 *   and is reported rather than silently ignored.
 *
 * `thumb_mime` stays: it describes the stored thumbnail, not a blob.
 *
 * @return array{dropped:bool, reason:string, remaining:array<int,string>}
 */
function drop_legacy_asset_blob_columns(): array
{
    $remaining = asset_blob_columns();

    if ($remaining === []) {
        return asset_blob_column_status();
    }

    $record = static fn (string $reason): array => asset_blob_column_status([
        'dropped' => false,
        'reason' => $reason,
        'remaining' => $remaining,
    ]);

    $legacyRows = (int) db()->query(
        'SELECT COUNT(*) FROM assets WHERE storage_key IS NULL OR storage_key = \'\''
    )->fetchColumn();

    if ($legacyRows > 0) {
        return $record(
            $legacyRows . ' row(s) still have no stored object; run `assets migrate-blobs` first'
        );
    }

    $version = (string) db()->query('SELECT sqlite_version()')->fetchColumn();

    if (version_compare($version, '3.35.0', '<')) {
        return $record(
            'SQLite ' . $version . ' predates ALTER TABLE DROP COLUMN (3.35); the empty columns stay'
        );
    }

    $pdo = db();
    $own = !$pdo->inTransaction();

    if ($own) {
        $pdo->beginTransaction();
    }

    try {
        foreach ($remaining as $column) {
            $pdo->exec('ALTER TABLE assets DROP COLUMN ' . $column);
        }

        if ($own) {
            $pdo->commit();
        }
    } catch (Throwable $e) {
        if ($own && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        return $record('could not drop the columns: ' . $e->getMessage());
    }

    return asset_blob_column_status([
        'dropped' => true,
        'reason' => 'dropped ' . implode(', ', $remaining),
        'remaining' => [],
    ]);
}

/**
 * sifpress2 used to keep every UI string in one `sifpress2.copy` JSON blob.
 * Each string is its own key now, so an existing install gets the blob expanded
 * into `sifpress2.copy.<name>` rows before it is dropped — carrying the blob's
 * kv_grants along, otherwise the guest-readable grant the sifront relies on
 * would be lost and the theme would silently fall back to its built-in copy.
 * Idempotent: a no-op once the blob is gone. Returns the rows written.
 */
function normalize_sifront_copy_kv(): int
{
    $pdo = db();
    $blobKey = 'sifpress2.copy';

    $stmt = $pdo->prepare('SELECT id, value_json, created_by, updated_by FROM kv_pairs WHERE key = ?');
    $stmt->execute([$blobKey]);
    $blob = $stmt->fetch();

    if ($blob === false) {
        return 0;
    }

    $values = json_decode((string) $blob['value_json'], true);
    $blobId = (int) $blob['id'];
    $written = 0;

    /* A blob the theme cannot read either: leave it alone rather than lose it. */
    if (!is_array($values)) {
        return 0;
    }

    $own = !$pdo->inTransaction();

    if ($own) {
        $pdo->beginTransaction();
    }

    try {
        $insert = $pdo->prepare(
            'INSERT OR IGNORE INTO kv_pairs (key, value_json, created_by, updated_by)
             VALUES (?, ?, ?, ?)'
        );
        $copyGrants = $pdo->prepare(
            'INSERT OR IGNORE INTO kv_grants (kv_id, user_id, granted_by, permission, note)
             SELECT ?, user_id, granted_by, permission, note FROM kv_grants WHERE kv_id = ?'
        );
        $findId = $pdo->prepare('SELECT id FROM kv_pairs WHERE key = ?');

        foreach ($values as $name => $value) {
            $name = trim((string) $name);

            /* Copy values are plain strings; anything else is not ours to split. */
            if ($name === '' || !is_string($value)) {
                continue;
            }

            $key = $blobKey . '.' . $name;
            $json = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

            if ($json === false) {
                continue;
            }

            /* OR IGNORE: a per-key row already saved by the new admin wins. */
            $insert->execute([$key, $json, $blob['created_by'], $blob['updated_by']]);

            $findId->execute([$key]);
            $id = $findId->fetchColumn();

            if ($id !== false) {
                $copyGrants->execute([(int) $id, $blobId]);
                $written++;
            }
        }

        $pdo->prepare('DELETE FROM kv_pairs WHERE key = ?')->execute([$blobKey]);

        if ($own) {
            $pdo->commit();
        }
    } catch (Throwable $e) {
        if ($own && $pdo->inTransaction()) {
            $pdo->rollBack();
        }

        throw $e;
    }

    return $written;
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
        'kvs.write',
        'sifronts.manage',
    ];

    $roles = [
        'admin'  => ['name' => 'Admin',  'permissions' => null],
        'editor' => [
            'name' => 'Editor',
            'permissions' => [
                'pages.read',
                'pages.write',
                'pages.delete',
                'assets.upload',
                'kvs.write',
            ],
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
 * Idempotent default-sifront seed: inserts a "Construction Page" with the
 * fallback HTML and sets it as the active sifront. Runs once; subsequent
 * calls are no-ops when a sifront already exists.
 */
function seed_default_sifront(): void
{
    $pdo = db();

    $count = (int) $pdo->query('SELECT COUNT(*) FROM sifronts')->fetchColumn();

    if ($count > 0) {
        return;
    }

    $siteName = APP_NAME;
    $configured = setting_get('site_name', '');
    if ($configured !== '') {
        $siteName = $configured;
    }

    $escaped = htmlspecialchars($siteName, ENT_QUOTES | ENT_HTML5, 'UTF-8');

    $content = '<!DOCTYPE html>'
        . '<html lang="en">'
        . '<head>'
        . '<meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>' . $escaped . '</title>'
        . '<style>'
        . '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
        . 'body{min-height:100vh;display:flex;align-items:center;justify-content:center;'
        . 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;'
        . 'background:#f5f5f7;color:#1d1d1f}'
        . '.card{text-align:center;padding:3rem 2rem;max-width:28rem}'
        . 'h1{font-size:1.5rem;font-weight:600;margin-bottom:.5rem}'
        . 'p{color:#6e6e73;font-size:.95rem;line-height:1.5}'
        . '</style>'
        . '</head>'
        . '<body>'
        . '<div class="card">'
        . '<h1>' . $escaped . '</h1>'
        . '<p>This site is currently under construction. Please check back later.</p>'
        . '</div>'
        . '</body>'
        . '</html>';

    $stmt = $pdo->prepare(
        'INSERT INTO sifronts (name, content, version) VALUES (?, ?, 1)'
    );
    $stmt->execute(['Construction Page', $content]);
    $id = (int) $pdo->lastInsertId();

    setting_set('active_sifront_id', (string) $id);
}

/**
 * Idempotent default-favicon seed: inserts a "Shifu" SVG into the assets
 * table and links it as the site favicon + apple-touch-icon. Runs once;
 * subsequent calls are no-ops.
 */
function seed_favicon(): void
{
    $pdo = db();

    $svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><circle cx="90" cy="90" r="84" fill="#cfd8dc"/><g fill="#1e293b"><circle cx="90" cy="24.6" r="12.3"/><path d="M81.2 33.4h17.6l8.8 12.3H72.4Z"/><path d="M90 43.9c-31.3 0-42.2 22.2-42.2 44 0 10.9 4.6 17.6 8.8 22.1-2.1-17.5 8.8-41.8 33.4-41.8s35.5 24.3 33.4 41.8c4.2-4.5 8.8-11.2 8.8-22.1 0-21.8-10.9-44-42.2-44"/></g><path d="M78 33.8q12 2.8 24 0" fill="none" stroke="#dc2626" stroke-width="4.2" stroke-linecap="round"/><g fill="none" stroke="#2563eb" stroke-linecap="round"><path d="M63.3 86.1q8.8-4.5 17.6 0m35.8 0q-8.8-4.5-17.6 0" stroke-width="3.5"/><path d="M90 81.6v13.3" stroke-width="2.8"/></g><g fill="#b45309"><path d="M90 100.2c-7 1.8-28.8 7.4-42.2 25 17.6-4.3 37.3-13.1 42.2-20.4Z"/><path d="M90 100.2c7 1.8 28.8 7.4 42.2 25-17.6-4.3-37.3-13.1-42.2-20.4ZM84.7 116l5.3 38.7 5.3-38.7Z"/></g></svg>';

    $check = $pdo->query("SELECT value FROM settings WHERE key = 'favicon_asset_id'")->fetch();
    $existingId = ($check !== false && (string) $check['value'] !== '') ? (int) $check['value'] : 0;

    /*
     * The favicon is an asset like any other, so it goes through the storage
     * backend rather than into a BLOB: a seeded BLOB row would count as legacy
     * and keep the `data` column alive forever (phase 5 of
     * plan/asset-storage-plan.md).
     */
    $current = null;

    if ($existingId > 0) {
        $row = $pdo->prepare('SELECT storage_key, storage FROM assets WHERE id = ?');
        $row->execute([$existingId]);
        $asset = $row->fetch();

        if ($asset !== false) {
            $key = (string) ($asset['storage_key'] ?? '');

            if ($key !== '') {
                $path = asset_storage()->localPath($key);
                $current = $path !== null && is_file($path) ? (string) file_get_contents($path) : null;
            } elseif (asset_column_exists('data')) {
                $row = $pdo->prepare('SELECT data FROM assets WHERE id = ?');
                $row->execute([$existingId]);
                $blob = $row->fetchColumn();
                $current = $blob === false ? null : (string) $blob;
            }
        }
    }

    if ($existingId > 0 && $current === $svg) {
        return;
    }

    /* Storage takes a path, so stage the SVG through a temp file. */
    $tmp = tempnam(sys_get_temp_dir(), 'sifpress-favicon-');

    if ($tmp === false) {
        throw new RuntimeException('Cannot create a temp file for the favicon.');
    }

    try {
        file_put_contents($tmp, $svg);
        [$storage, $key, $etag] = asset_store_file($tmp, 'image/svg+xml');
    } finally {
        @unlink($tmp);
    }

    /* Clear the legacy BLOB when the column still exists, so the row counts as
     * migrated and the cleanup can drop it. */
    $legacy = asset_column_exists('data') ? ', data = NULL' : '';

    if ($existingId > 0) {
        $stmt = $pdo->prepare(
            'UPDATE assets SET size_bytes = ?, name = ?, mime = ?, storage = ?, storage_key = ?,'
            . ' storage_etag = ?, thumb_key = NULL' . $legacy . ' WHERE id = ?'
        );
        $stmt->execute([strlen($svg), 'default-favicon.svg', 'image/svg+xml', $storage, $key, $etag, $existingId]);
        $id = $existingId;
    } else {
        $stmt = $pdo->prepare(
            'INSERT INTO assets (name, mime, kind, size_bytes, data, is_public, storage, storage_key, storage_etag)'
            . ' VALUES (?, ?, ?, ?, NULL, 1, ?, ?, ?)'
        );
        $stmt->execute(['default-favicon.svg', 'image/svg+xml', 'image', strlen($svg), $storage, $key, $etag]);
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
 * SIFPRESS_ADMIN_PASSWORD constant (from sifpress_config.php).
 * The account is flagged must_change_password so the app blocks until the
 * operator changes it.
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

    $password = defined('SIFPRESS_ADMIN_PASSWORD') ? SIFPRESS_ADMIN_PASSWORD : '';

    if ($password === '') {
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
