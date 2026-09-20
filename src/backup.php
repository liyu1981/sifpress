/**
 * ------------------------------------------------------------
 * Backups + cron
 *
 *   php sifpress.php backup [...]   snapshot the SQLite DB to a .tgz
 *   php sifpress.php cron ...       manage the backup crontab entry
 *
 * The DB runs in WAL mode, so the snapshot is taken with SQLite's own
 * `VACUUM INTO`, which produces a consistent, fully-checkpointed copy
 * (including WAL content) as a single file. The archive is built with the
 * system `tar(1)` so the artifact needs no ext-zip / ext-phar dependency.
 * ------------------------------------------------------------
 */

/** Configured backup folder ('' when unset — the command then fails). */
function backup_config_dir(): string
{
    return defined('SIFPRESS_BACKUP_DIR') ? trim((string) SIFPRESS_BACKUP_DIR) : '';
}

/** Configured retention count (default 90; <= 0 means unlimited). */
function backup_config_keep(): int
{
    return defined('SIFPRESS_BACKUP_KEEP') ? (int) SIFPRESS_BACKUP_KEEP : 90;
}

/** Archive filename prefix: the configured one, else the artifact name. */
function backup_config_prefix(): string
{
    $raw = defined('SIFPRESS_BACKUP_PREFIX') ? trim((string) SIFPRESS_BACKUP_PREFIX) : '';

    if ($raw === '') {
        $raw = pathinfo(basename(__FILE__), PATHINFO_FILENAME);
    }

    $safe = preg_replace('/[^A-Za-z0-9._-]+/', '-', $raw);

    return $safe === null || $safe === '' ? 'sifpress' : $safe;
}

/**
 * Snapshot the live DB with `VACUUM INTO` and tar it into
 * `<dir>/<prefix>-<Ymd-His>.tgz`. Returns path/name/bytes.
 *
 * @return array{path: string, name: string, bytes: int}
 */
function db_backup_create(string $dir, string $prefix): array
{
    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create backup directory: {$dir}");
    }

    if (!is_writable($dir)) {
        throw new RuntimeException("Backup directory is not writable: {$dir}");
    }

    $name = $prefix . '-' . date('Ymd-His') . '.tgz';
    $target = rtrim($dir, '/\\') . '/' . $name;
    $tmpArchive = $target . '.tmp';
    $work = sys_get_temp_dir() . '/sifpress-backup-' . bin2hex(random_bytes(6));

    if (!@mkdir($work, 0700, true) && !is_dir($work)) {
        throw new RuntimeException("Cannot create temp directory: {$work}");
    }

    $snapshot = $work . '/sys.db';

    try {
        db_backup_snapshot($snapshot);

        $check = new PDO('sqlite:' . $snapshot);
        $check->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $integrity = (string) $check->query('PRAGMA integrity_check')->fetchColumn();
        $check = null;

        if ($integrity !== 'ok') {
            throw new RuntimeException('Snapshot failed integrity_check: ' . $integrity);
        }

        db_backup_tar($work, 'sys.db', $tmpArchive);

        if (!@rename($tmpArchive, $target)) {
            throw new RuntimeException("Cannot move archive into place: {$target}");
        }
    } catch (Throwable $e) {
        @unlink($tmpArchive);
        throw $e;
    } finally {
        backup_rmdir($work);
    }

    if (function_exists('posix_geteuid') && posix_geteuid() === 0) {
        sifpress_cli_adopt_owner($target);
    }

    return ['path' => $target, 'name' => $name, 'bytes' => (int) @filesize($target)];
}

/**
 * Write a consistent copy of the live database to $snapshot. Uses
 * `VACUUM INTO` (SQLite >= 3.27); on older versions it checkpoints and
 * copies the main file instead (a warning is emitted).
 */
function db_backup_snapshot(string $snapshot): void
{
    $pdo = db();
    $version = (string) $pdo->query('SELECT sqlite_version()')->fetchColumn();

    if (version_compare($version, '3.27.0', '>=')) {
        $pdo->exec('VACUUM INTO ' . $pdo->quote($snapshot));

        return;
    }

    fwrite(
        STDERR,
        "Warning: SQLite {$version} lacks VACUUM INTO; falling back to a checkpoint copy.\n"
    );

    $pdo->exec('PRAGMA wal_checkpoint(TRUNCATE)');

    if (!@copy(db_path(), $snapshot)) {
        throw new RuntimeException('Could not copy the database file.');
    }
}

/**
 * Create a gzip tar archive holding a single file. `tar -czf` is used so
 * the artifact needs no PHP archive extension.
 */
function db_backup_tar(string $dir, string $entry, string $target): void
{
    if (!function_exists('exec')) {
        throw new RuntimeException('The exec() function is disabled; cannot run tar(1).');
    }

    $output = [];
    $code = 0;
    exec(
        'tar -czf ' . escapeshellarg($target) . ' -C ' . escapeshellarg($dir)
        . ' ' . escapeshellarg($entry) . ' 2>&1',
        $output,
        $code
    );

    if ($code !== 0 || !is_file($target)) {
        @unlink($target);
        $detail = trim(implode("\n", $output));

        throw new RuntimeException(
            'tar failed' . ($detail === '' ? '' : ': ' . $detail)
            . ' (the system tar(1) command is required)'
        );
    }
}

/**
 * Delete all but the newest $keep archives matching `<prefix>-*.tgz`.
 * Returns the basenames removed.
 *
 * @return string[]
 */
function db_backup_prune(string $dir, string $prefix, int $keep): array
{
    if ($keep <= 0) {
        return [];
    }

    $files = array_values(array_filter(
        glob(rtrim($dir, '/\\') . '/' . $prefix . '-*.tgz') ?: [],
        static fn (string $path): bool => is_file($path)
    ));

    usort(
        $files,
        static fn (string $a, string $b): int =>
            (@filemtime($b) <=> @filemtime($a)) ?: strcmp($b, $a)
    );

    $removed = [];

    foreach (array_slice($files, $keep) as $file) {
        if (@unlink($file)) {
            $removed[] = basename($file);
        }
    }

    return $removed;
}

/** Recursively delete a directory (best-effort). */
function backup_rmdir(string $dir): void
{
    if (!is_dir($dir)) {
        return;
    }

    foreach (scandir($dir) ?: [] as $entry) {
        if ($entry === '.' || $entry === '..') {
            continue;
        }

        $path = $dir . '/' . $entry;
        is_dir($path) ? backup_rmdir($path) : @unlink($path);
    }

    @rmdir($dir);
}

/**
 * `backup [--config=PATH] [--dir=PATH] [--keep=N] [--dry-run]`: snapshot the
 * DB and prune old archives.
 */
function sifpress_cli_backup(string $configPath, array $options): void
{
    if (!is_file($configPath)) {
        fwrite(STDERR, 'No config found. Run: php ' . basename(__FILE__) . " setup\n");
        exit(1);
    }

    require_once $configPath;

    $dir = trim(sifpress_cli_option($options, 'dir') ?? backup_config_dir());

    if ($dir === '') {
        fwrite(
            STDERR,
            "SIFPRESS_BACKUP_DIR is not set. Add it to {$configPath}\n"
            . 'or pass --dir=PATH (there is no default backup folder).' . "\n"
        );
        exit(1);
    }

    $keepOption = sifpress_cli_option($options, 'keep');
    $keep = $keepOption !== null ? (int) $keepOption : backup_config_keep();
    $prefix = backup_config_prefix();

    if (isset($options['dry-run'])) {
        fwrite(STDOUT, "Backup directory: {$dir}\n");
        fwrite(STDOUT, "Archive prefix:   {$prefix}\n");
        fwrite(STDOUT, 'Retention:        ' . ($keep <= 0 ? 'unlimited' : $keep) . "\n");

        $existing = count(glob(rtrim($dir, '/\\') . '/' . $prefix . '-*.tgz') ?: []);
        fwrite(STDOUT, "Existing archives: {$existing}\n");

        return;
    }

    try {
        $result = db_backup_create($dir, $prefix);
        $removed = db_backup_prune($dir, $prefix, $keep);
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . "\n");
        exit(1);
    }

    sifpress_cli_adopt_db();

    fwrite(
        STDOUT,
        "Backed up to {$result['path']} (" . number_format($result['bytes']) . " bytes)\n"
    );

    if ($removed !== []) {
        fwrite(STDOUT, 'Pruned ' . count($removed) . " old archive(s):\n");

        foreach ($removed as $name) {
            fwrite(STDOUT, "  - {$name}\n");
        }
    }
}

const SIFPRESS_CRON_BEGIN = '# BEGIN sifpress backup';
const SIFPRESS_CRON_END = '# END sifpress backup';

/** True when the system `crontab(1)` command is usable. */
function cron_available(): bool
{
    if (!function_exists('exec')) {
        return false;
    }

    $output = [];
    $code = 0;
    exec('command -v crontab 2>/dev/null', $output, $code);

    return $code === 0;
}

/** Current crontab for $user (null = current user), or '' when none. */
function cron_read(?string $user): string
{
    $output = [];
    $code = 0;
    exec(
        'crontab ' . cron_user_flag($user) . '-l 2>/dev/null',
        $output,
        $code
    );

    return $code === 0 ? implode("\n", $output) . (count($output) > 0 ? "\n" : '') : '';
}

/** Replace $user's crontab with $content. */
function cron_write(string $content, ?string $user): void
{
    $tmp = tempnam(sys_get_temp_dir(), 'sifpress-cron-');

    if ($tmp === false || @file_put_contents($tmp, $content) === false) {
        throw new RuntimeException('Could not stage the crontab file.');
    }

    $output = [];
    $code = 0;
    exec(
        'crontab ' . cron_user_flag($user) . escapeshellarg($tmp) . ' 2>&1',
        $output,
        $code
    );
    @unlink($tmp);

    if ($code !== 0) {
        throw new RuntimeException('crontab failed: ' . trim(implode("\n", $output)));
    }
}

/** Remove $user's whole crontab. */
function cron_remove_all(?string $user): void
{
    $output = [];
    $code = 0;
    exec('crontab ' . cron_user_flag($user) . '-r 2>&1', $output, $code);

    if ($code !== 0) {
        throw new RuntimeException('crontab -r failed: ' . trim(implode("\n", $output)));
    }
}

/** `-u USER ` when targeting another user, else ''. */
function cron_user_flag(?string $user): string
{
    return $user !== null && $user !== '' ? '-u ' . escapeshellarg($user) . ' ' : '';
}

/** Strip the managed sifpress block from a crontab. */
function cron_strip_block(string $content): string
{
    $pattern = '/' . preg_quote(SIFPRESS_CRON_BEGIN, '/') . "\n.*?"
        . preg_quote(SIFPRESS_CRON_END, '/') . "\n?/s";

    return preg_replace($pattern, '', $content) ?? $content;
}

/**
 * `cron install|show|remove [--schedule=...] [--user=USER] [--log=PATH]`:
 * manage a marked backup entry in a user's crontab.
 */
function sifpress_cli_cron(string $configPath, array $options, array $argv): void
{
    $action = 'install';

    foreach (array_slice($argv, 2) as $arg) {
        if (substr($arg, 0, 2) !== '--') {
            $action = strtolower(trim($arg));
            break;
        }
    }

    if (!in_array($action, ['install', 'show', 'remove'], true)) {
        fwrite(STDERR, "Unknown cron action: {$action} (use install, show or remove)\n");
        exit(1);
    }

    $user = sifpress_cli_option($options, 'user');

    if ($user !== null && $user !== '' && !(function_exists('posix_geteuid') && posix_geteuid() === 0)) {
        fwrite(STDERR, 'Installing for another user requires root (or use --user as root).' . "\n");
        exit(1);
    }

    if (!cron_available()) {
        fwrite(STDERR, "The system crontab(1) command is not available.\n");
        exit(1);
    }

    if ($action === 'show') {
        $existing = cron_read($user);

        fwrite(STDOUT, $existing === '' ? "No crontab installed.\n" : $existing);

        return;
    }

    if ($action === 'remove') {
        $stripped = trim(cron_strip_block(cron_read($user)));

        try {
            if ($stripped === '') {
                cron_remove_all($user);
            } else {
                cron_write($stripped . "\n", $user);
            }
        } catch (Throwable $e) {
            fwrite(STDERR, $e->getMessage() . "\n");
            exit(1);
        }

        fwrite(STDOUT, "Removed the sifpress backup cron entry.\n");

        return;
    }

    if (!is_file($configPath)) {
        fwrite(STDERR, 'No config found. Run: php ' . basename(__FILE__) . " setup\n");
        exit(1);
    }

    require_once $configPath;

    $schedule = trim(sifpress_cli_option($options, 'schedule') ?? '0 3 * * *');

    if (!cron_schedule_valid($schedule)) {
        fwrite(STDERR, "Invalid schedule: {$schedule}\n");
        exit(1);
    }

    $log = sifpress_cli_option($options, 'log');

    if ($log === null || trim($log) === '') {
        $dir = backup_config_dir();

        if ($dir === '') {
            fwrite(
                STDERR,
                "SIFPRESS_BACKUP_DIR is not set; set it or pass --log=PATH.\n"
            );
            exit(1);
        }

        $log = rtrim($dir, '/\\') . '/backup.log';
    }

    $configAbs = realpath($configPath) ?: $configPath;
    $artifact = realpath(__FILE__) ?: __FILE__;
    $php = PHP_BINARY !== '' ? PHP_BINARY : 'php';

    $line = $schedule
        . ' ' . escapeshellarg($php)
        . ' ' . escapeshellarg($artifact)
        . ' backup --config=' . escapeshellarg($configAbs)
        . ' >> ' . escapeshellarg($log) . ' 2>&1';

    // Cron treats a bare '%' as a newline; escape it.
    $line = str_replace('%', '\\%', $line);

    $block = SIFPRESS_CRON_BEGIN . "\n" . $line . "\n" . SIFPRESS_CRON_END . "\n";
    $existing = rtrim(cron_strip_block(cron_read($user)));
    $next = ($existing === '' ? '' : $existing . "\n") . $block;

    try {
        cron_write($next, $user);
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . "\n");
        exit(1);
    }

    $who = $user !== null && $user !== '' ? $user : 'the current user';

    fwrite(STDOUT, "Installed backup cron entry for {$who}:\n");
    fwrite(STDOUT, "  {$line}\n");
}

/** A cron schedule is `@keyword` or 5 whitespace-separated fields. */
function cron_schedule_valid(string $schedule): bool
{
    if (str_starts_with($schedule, '@')) {
        return preg_match('/^@[a-z]+$/', $schedule) === 1;
    }

    return count(preg_split('/\s+/', trim($schedule)) ?: []) === 5;
}
