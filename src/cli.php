/**
 * ------------------------------------------------------------
 * CLI
 *
 *   php sifpress.php [command] [options]
 *
 *   setup            (default) write sifpress_config.php + create the DB folder
 *   migrate          apply pending migrations
 *   change_password  set a user's password (clears must_change_password)
 *   inject_sifront   (dev only) push the on-disk build companions into the DB
 *   update_sifront   install/update a sifront from a .sifront archive (unzip)
 *   backup           snapshot the DB to a .tgz and prune old archives
 *   config           view or update sifpress_config.php
 *   cron             install/remove the backup crontab entry
 *   rewrite          generate Apache/nginx clean-path rewrite rules (+ check)
 *   status           print paths, version and migration state
 *   version          print the Sifpress version + installed sifront versions
 *   help             show usage
 *
 * Running `setup` from a shell creates the config as the current user, which
 * avoids the web SAPI's inability to create files in a read-only document
 * root. When run as root the created files are chowned to the artifact's owner
 * (usually the web-server user) so the web request can read/write them.
 * ------------------------------------------------------------
 */

function sifpress_cli(array $argv): never
{
    $command = $argv[1] ?? 'setup';
    $options = sifpress_cli_parse_options(array_slice($argv, 2));
    $configPath = sifpress_cli_option($options, 'config') ?? dirname(__FILE__) . '/sifpress_config.php';

    switch ($command) {
        case 'setup':
            sifpress_cli_setup($configPath, $options);
            break;

        case 'migrate':
            sifpress_cli_migrate($configPath);
            break;

        case 'change_password':
            sifpress_cli_change_password($configPath, $argv);
            break;

        case 'sessions':
            sifpress_cli_sessions($configPath, $argv);
            break;

        case 'assets':
            sifpress_cli_assets($configPath, $options, $argv);
            break;

        case 'inject_sifront':
            sifpress_cli_inject_sifront($configPath, $argv);
            break;

        case 'update_sifront':
            sifpress_cli_update_sifront($configPath, $options, $argv);
            break;

        case 'backup':
            sifpress_cli_backup($configPath, $options);
            break;

        case 'config':
            sifpress_cli_config($configPath, $options, $argv);
            break;

        case 'cron':
            sifpress_cli_cron($configPath, $options, $argv);
            break;

        case 'rewrite':
            sifpress_cli_rewrite($configPath, $options, $argv);
            break;

        case 'status':
            sifpress_cli_status($configPath);
            break;

        case 'version':
            sifpress_cli_version($configPath);
            break;

        case 'help':
        case '--help':
        case '-h':
            sifpress_cli_usage();
            break;

        default:
            fwrite(STDERR, "Unknown command: {$command}\n\n");
            sifpress_cli_usage();
            exit(1);
    }

    exit(0);
}

function sifpress_cli_usage(): void
{
    $bin = basename(__FILE__);

    fwrite(STDOUT, implode("\n", [
        'Sifpress CLI',
        '',
        "Usage: php {$bin} [command] [options]",
        '',
        'Commands:',
        '  setup            (default) create sifpress_config.php and the DB folder',
        '  migrate          apply pending migrations',
        '  change_password  set a user password: change_password <user> <password>',
        '  sessions         inspect and manage sign-in sessions:',
        '                   sessions                  list active sessions',
        '                   sessions purge            delete expired sessions + old login attempts',
        '                   sessions revoke <user>   sign a user out everywhere',
        '  assets           move asset bytes out of the database into storage:',
        '                   assets status             where every asset\'s bytes live now',
        '                   assets migrate-blobs     write legacy BLOB rows to storage',
        '                     [--dry-run] [--limit=N] [--keep-blobs=0] [--vacuum]',
        '                   assets verify [--sample=N]  md5-check stored objects',
        '                   assets gc                delete orphan objects + expired uploads',
        '                   assets vacuum            reclaim the pages freed by dropping the BLOBs',
        '  inject_sifront   (dev only) push a built sifront into the DB and activate it:',
        '                   inject_sifront [name]   (default: sifpress1)',
        '  update_sifront   install/update a sifront from a .sifront archive:',
        '                   update_sifront <file.sifront> [--name=NAME] [--activate]',
        '  backup           snapshot the SQLite DB to a .tgz and prune old ones:',
        '                   backup [--config=PATH] [--dir=PATH] [--keep=N] [--dry-run]',
        '  config           view or update sifpress_config.php:',
        '                   config [--config=PATH] [--show-secrets]',
        '                   config --set KEY=VALUE [--set KEY=VALUE ...]',
        '  cron             manage the backup crontab entry for a user:',
        '                   cron install [--schedule="0 3 * * *"] [--user=USER] [--log=PATH]',
        '                   cron show | cron remove [--user=USER]',
        '  rewrite          generate clean-path (pretty URL) rewrite rules:',
        '                   rewrite [apache|nginx|both|check|status]',
        '                     [--base-path=/app] [--out=FILE|DIR] [--config=PATH]',
        '                     [--set-config] [--forget] [--base-url=URL]',
        '  status           print paths, version and migration state',
        '  version          print the Sifpress version + installed sifront versions',
        '  help             show this help',
        '',
        'setup options:',
        '  --db-dir=PATH           DB folder (default: <artifact dir>/var/sifpress)',
        '  --admin-password=PASS   initial admin password (default: admin)',
        '  --base-url=URL          base URL for generated links',
        '  --manifest-url=URL      update manifest URL',
        '  --force                 overwrite an existing config',
        '',
    ]));
}

/**
 * Parse `--key=value` / `--flag` arguments into an associative array.
 */
function sifpress_cli_parse_options(array $args): array
{
    $options = [];

    foreach ($args as $arg) {
        if (substr($arg, 0, 2) !== '--') {
            continue;
        }

        $body = substr($arg, 2);
        $eq = strpos($body, '=');

        if ($eq === false) {
            $options[$body] = true;
        } else {
            $options[substr($body, 0, $eq)] = substr($body, $eq + 1);
        }
    }

    return $options;
}

function sifpress_cli_option(array $options, string $name): ?string
{
    $value = $options[$name] ?? null;

    return is_string($value) ? $value : null;
}

function sifpress_cli_setup(string $configPath, array $options): void
{
    if (is_file($configPath) && !isset($options['force'])) {
        fwrite(STDOUT, "Config already exists: {$configPath}\n");
        fwrite(STDOUT, "Nothing to do (pass --force to overwrite).\n");
        return;
    }

    $dbDir = sifpress_cli_option($options, 'db-dir') ?? (dirname(__FILE__) . '/var/sifpress');
    $content = sifpress_config_template(
        $dbDir,
        sifpress_cli_option($options, 'admin-password') ?? '',
        sifpress_cli_option($options, 'manifest-url') ?? '',
        sifpress_cli_option($options, 'base-url') ?? ''
    );

    if (@file_put_contents($configPath, $content) === false) {
        $error = error_get_last();
        fwrite(STDERR, "Failed to write {$configPath}: " . ($error['message'] ?? 'unknown error') . "\n");
        exit(1);
    }

    if (!is_dir($dbDir) && !@mkdir($dbDir, 0775, true) && !is_dir($dbDir)) {
        fwrite(STDERR, "Failed to create DB folder: {$dbDir}\n");
        exit(1);
    }

    sifpress_cli_adopt_owner($configPath);
    sifpress_cli_adopt_owner($dbDir);

    fwrite(STDOUT, "Wrote {$configPath}\n");
    fwrite(STDOUT, "DB folder: {$dbDir}\n");
    fwrite(STDOUT, 'Next: php ' . basename(__FILE__) . " migrate\n");
}

function sifpress_cli_migrate(string $configPath): void
{
    if (!is_file($configPath)) {
        fwrite(STDERR, 'No config found. Run: php ' . basename(__FILE__) . " setup\n");
        exit(1);
    }

    require_once $configPath;

    if (!db_needs_migration()) {
        fwrite(STDOUT, 'Database is up to date (' . count(db_version()['applied']) . " migrations).\n");

        /*
         * Nothing to apply, but the code-side steps still have to run: an
         * operator who just finished `assets migrate-blobs` wants the columns
         * dropped now, not after the next release.
         */
        db_housekeeping();
        $cleanup = asset_blob_column_status();

        if ($cleanup['reason'] !== 'not run yet') {
            fwrite(STDOUT, 'Asset cleanup: ' . $cleanup['reason'] . "\n");
        }

        sifpress_cli_adopt_db();

        return;
    }

    $applied = db_migrate_and_seed();
    $cleanup = asset_blob_column_status();

    fwrite(STDOUT, 'Applied ' . count($applied) . " migration(s):\n");

    foreach ($applied as $version) {
        fwrite(STDOUT, "  - {$version}\n");
    }

    if ($cleanup['reason'] !== 'not run yet') {
        fwrite(STDOUT, 'Asset cleanup: ' . $cleanup['reason'] . "\n");
    }

    sifpress_cli_adopt_db();
}

/**
 * `change_password <user> <password>`: set a user's password and clear
 * must_change_password. <user> is a username or email (e.g. `admin`).
 */
function sifpress_cli_change_password(string $configPath, array $argv): void
{
    if (!is_file($configPath)) {
        fwrite(STDERR, 'No config found. Run: php ' . basename(__FILE__) . " setup\n");
        exit(1);
    }

    require_once $configPath;

    if (db_needs_migration()) {
        fwrite(STDERR, 'Database needs migration. Run: php ' . basename(__FILE__) . " migrate\n");
        exit(1);
    }

    $username = trim((string) ($argv[2] ?? ''));
    $password = (string) ($argv[3] ?? '');

    if ($username === '' || $password === '') {
        fwrite(STDERR, 'Usage: php ' . basename(__FILE__) . " change_password <user> <password>\n");
        exit(1);
    }

    $errors = validate_password($password);

    if ($errors !== []) {
        fwrite(STDERR, 'Password rejected: ' . implode('; ', $errors) . "\n");
        exit(1);
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
    $stmt->execute([$username, $username]);
    $id = $stmt->fetchColumn();

    if ($id === false) {
        fwrite(STDERR, "No user found for '{$username}'.\n");
        exit(1);
    }

    $pdo->prepare(
        "UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = datetime('now') WHERE id = ?"
    )->execute([password_hash($password, PASSWORD_DEFAULT), (int) $id]);

    /* A CLI reset is the "I was compromised" path: end every live session. */
    $revoked = revoke_sessions((int) $id);

    sifpress_cli_adopt_db();

    fwrite(
        STDOUT,
        "Password updated for '{$username}'. Sign in with the new password.\n"
        . "Revoked {$revoked} active session(s).\n"
    );
}

/**
 * `sessions`: list what is currently signed in, purge the dead rows, or force
 * a user out everywhere (the incident-response lever when no UI is at hand).
 */
function sifpress_cli_sessions(string $configPath, array $argv): void
{
    if (!is_file($configPath)) {
        fwrite(STDERR, 'No config found. Run: php ' . basename(__FILE__) . " setup\n");
        exit(1);
    }

    require_once $configPath;

    if (db_needs_migration()) {
        fwrite(STDERR, 'Database needs migration. Run: php ' . basename(__FILE__) . " migrate\n");
        exit(1);
    }

    $action = 'list';

    foreach (array_slice($argv, 2) as $arg) {
        if (substr($arg, 0, 2) !== '--') {
            $action = strtolower(trim($arg));
            break;
        }
    }

    if ($action === 'purge') {
        $expired = (int) db()->query(
            "SELECT COUNT(*) FROM sessions WHERE expires_at < datetime('now')"
        )->fetchColumn();
        $attempts = (int) db()->query(
            "SELECT COUNT(*) FROM login_attempts WHERE created_at < datetime('now', '-30 days')"
        )->fetchColumn();

        purge_sessions();

        fwrite(STDOUT, "Purged {$expired} expired session(s) and {$attempts} login attempt row(s).\n");

        return;
    }

    if ($action === 'revoke') {
        $username = trim((string) ($argv[3] ?? ''));

        if ($username === '') {
            fwrite(STDERR, "Usage: php " . basename(__FILE__) . " sessions revoke <user>\n");
            exit(1);
        }

        $stmt = db()->prepare('SELECT id FROM users WHERE username = ? OR email = ?');
        $stmt->execute([$username, $username]);
        $id = $stmt->fetchColumn();

        if ($id === false) {
            fwrite(STDERR, "No user found for '{$username}'.\n");
            exit(1);
        }

        $revoked = revoke_sessions((int) $id);
        fwrite(STDOUT, "Revoked {$revoked} session(s) for '{$username}'.\n");

        return;
    }

    if ($action !== 'list') {
        fwrite(STDERR, "Unknown sessions action: {$action} (use list, purge or revoke)\n");
        exit(1);
    }

    fwrite(STDOUT, sprintf(
        "Idle timeout: %dh   Absolute lifetime: %dh   Max per user: %d\n\n",
        intdiv(SESSION_IDLE_TTL, 3600),
        intdiv(SESSION_ABSOLUTE_TTL, 3600),
        SESSION_MAX_PER_USER
    ));

    $rows = db()->query(
        "SELECT s.user_id, u.username, s.ip, s.created_at, s.last_seen_at, s.expires_at
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.expires_at > datetime('now')
          ORDER BY s.user_id, datetime(s.last_seen_at) DESC"
    )->fetchAll();

    if ($rows === []) {
        fwrite(STDOUT, "No active sessions.\n");

        return;
    }

    foreach ($rows as $row) {
        fwrite(STDOUT, sprintf(
            "#%-4d %-16s %-15s signed in %s  last seen %s  expires %s\n",
            $row['user_id'],
            $row['username'],
            $row['ip'],
            $row['created_at'],
            $row['last_seen_at'],
            $row['expires_at']
        ));
    }

    $failed = (int) db()->query(
        "SELECT COUNT(*) FROM login_attempts WHERE ok = 0 AND created_at > datetime('now', '-24 hours')"
    )->fetchColumn();
    $expiredCount = (int) db()->query(
        "SELECT COUNT(*) FROM sessions WHERE expires_at < datetime('now')"
    )->fetchColumn();

    fwrite(
        STDOUT,
        "\n" . count($rows) . " active session(s), {$expiredCount} expired row(s) pending purge, "
        . "{$failed} failed sign-in(s) in the last 24h.\n"
    );
}

/**
 * Dev-only `inject_sifront [name]`: read the on-disk build companions and
 * push them into the DB through the same columns the admin flow writes, then
 * activate the sifront. Absent from release builds.
 */
function sifpress_cli_inject_sifront(string $configPath, array $argv): void
{
    if (!function_exists('dev_inject_sifront')) {
        fwrite(STDERR, "inject_sifront is only available in dev builds.\n");
        exit(1);
    }

    if (!is_file($configPath)) {
        fwrite(STDERR, 'No config found. Run: php ' . basename(__FILE__) . " setup\n");
        exit(1);
    }

    require_once $configPath;

    if (db_needs_migration()) {
        fwrite(STDERR, 'Database needs migration. Run: php ' . basename(__FILE__) . " migrate\n");
        exit(1);
    }

    $name = trim((string) ($argv[2] ?? 'sifpress1'));

    if ($name === '') {
        $name = 'sifpress1';
    }

    try {
        $result = dev_inject_sifront($name);
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . "\n");
        exit(1);
    }

    sifpress_cli_adopt_db();

    fwrite(
        STDOUT,
        "Injected '{$name}' (v{$result['version']}, id {$result['id']}) and activated it.\n"
    );
}

/**
 * `update_sifront <file.sifront> [--name=NAME] [--activate]`: extract a
 * built sifront archive with the system unzip(1) and upsert it into the DB
 * through the normal storage columns. Creates the row when the name is new;
 * pass --activate to also make it the active sifront.
 */
function sifpress_cli_update_sifront(string $configPath, array $options, array $argv): void
{
    if (!is_file($configPath)) {
        fwrite(STDERR, 'No config found. Run: php ' . basename(__FILE__) . " setup\n");
        exit(1);
    }

    $file = '';

    foreach (array_slice($argv, 2) as $arg) {
        if (substr($arg, 0, 2) !== '--') {
            $file = trim($arg);
            break;
        }
    }

    if ($file === '') {
        fwrite(
            STDERR,
            'Usage: php ' . basename(__FILE__) . " update_sifront <file.sifront> [--name=NAME] [--activate]\n"
        );
        exit(1);
    }

    require_once $configPath;

    if (db_needs_migration()) {
        fwrite(STDERR, 'Database needs migration. Run: php ' . basename(__FILE__) . " migrate\n");
        exit(1);
    }

    try {
        $archive = sifront_read_archive($file);

        $name = sifpress_cli_option($options, 'name');

        if ($name === null || trim($name) === '') {
            $metaName = $archive['meta']['name'] ?? null;
            $name = is_string($metaName) && trim($metaName) !== ''
                ? trim($metaName)
                : pathinfo($file, PATHINFO_FILENAME);
        }

        $result = sifront_store($name, $archive['meta'], $archive['bundle'], $archive['version']);

        if (isset($options['activate'])) {
            setting_set('active_sifront_id', (string) $result['id']);
        }
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . "\n");
        exit(1);
    }

    sifpress_cli_adopt_db();

    $verb = $result['created'] ? 'Installed' : 'Updated';
    $suffix = isset($options['activate']) ? ' and activated it' : '';

    fwrite(STDOUT, "{$verb} '{$name}' (v{$result['version']}, id {$result['id']}){$suffix}.\n");
}

/**
 * Known config keys and the PHP type to store them as. Unknown keys are
 * inferred from the value text.
 */
function sifpress_config_types(): array
{
    return [
        'SIFPRESS_DB_DIR' => 'string',
        'SIFPRESS_ADMIN_PASSWORD' => 'string',
        'SIFPRESS_MANIFEST_URL' => 'string',
        'SIFPRESS_BASE_URL' => 'string',
        'SIFPRESS_PRETTY_URLS' => 'string',
        'SIFPRESS_BACKUP_DIR' => 'string',
        'SIFPRESS_BACKUP_KEEP' => 'int',
        'SIFPRESS_BACKUP_PREFIX' => 'string',
    ];
}

/** Whether a config key holds a value that should be masked in output. */
function sifpress_config_secret(string $key): bool
{
    return preg_match('/PASSWORD|SECRET|TOKEN|KEY/i', $key) === 1;
}

/** Cast a CLI value to the type a config key expects. */
function sifpress_config_cast(string $key, string $raw): mixed
{
    $type = sifpress_config_types()[$key] ?? null;
    $value = trim($raw);

    if ($type === 'int') {
        if (preg_match('/^-?\d+$/', $value) !== 1) {
            throw new RuntimeException("{$key} must be an integer.");
        }

        return (int) $value;
    }

    if ($type === 'string') {
        return $raw;
    }

    if (strcasecmp($value, 'true') === 0) {
        return true;
    }

    if (strcasecmp($value, 'false') === 0) {
        return false;
    }

    if (strcasecmp($value, 'null') === 0) {
        return null;
    }

    if (preg_match('/^-?\d+$/', $value) === 1) {
        return (int) $value;
    }

    if (is_numeric($value)) {
        return (float) $value;
    }

    return $raw;
}

/**
 * Rewrite `define()` values in a config source while preserving comments and
 * every other statement. The tokenizer keeps string values containing `);`
 * or quotes safe; keys that are missing are appended.
 */
function sifpress_config_patch(string $source, array $values): string
{
    $tokens = token_get_all($source);
    $offsets = [];
    $pos = 0;

    foreach ($tokens as $i => $token) {
        $offsets[$i] = $pos;
        $pos += strlen(is_array($token) ? $token[1] : $token);
    }

    $offsets[count($tokens)] = $pos;

    $replacements = [];
    $found = [];
    $count = count($tokens);

    for ($i = 0; $i < $count; $i++) {
        $token = $tokens[$i];

        if (!is_array($token) || $token[0] !== T_STRING || strtolower($token[1]) !== 'define') {
            continue;
        }

        $j = $i + 1;

        while ($j < $count && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) {
            $j++;
        }

        if ($j >= $count || $tokens[$j] !== '(') {
            continue;
        }

        $j++;

        while ($j < $count && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) {
            $j++;
        }

        if ($j >= $count || !is_array($tokens[$j]) || $tokens[$j][0] !== T_CONSTANT_ENCAPSED_STRING) {
            continue;
        }

        $name = stripcslashes(substr($tokens[$j][1], 1, -1));
        $j++;

        while ($j < $count && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) {
            $j++;
        }

        if ($j >= $count || $tokens[$j] !== ',') {
            continue;
        }

        $j++;

        while ($j < $count && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) {
            $j++;
        }

        $valueStart = $j;
        $depth = 0;

        while ($j < $count) {
            $text = is_array($tokens[$j]) ? $tokens[$j][1] : $tokens[$j];

            if ($text === '(') {
                $depth++;
            } elseif ($text === ')') {
                if ($depth === 0) {
                    break;
                }

                $depth--;
            }

            $j++;
        }

        if (!array_key_exists($name, $values)) {
            continue;
        }

        $replacements[] = [$offsets[$valueStart], $offsets[$j], var_export($values[$name], true)];
        $found[$name] = true;
    }

    usort($replacements, static fn (array $a, array $b): int => $b[0] <=> $a[0]);

    foreach ($replacements as [$start, $end, $text]) {
        $source = substr($source, 0, $start) . $text . substr($source, $end);
    }

    $missing = array_diff_key($values, $found);

    if ($missing !== []) {
        $source = rtrim($source) . "\n";

        foreach ($missing as $name => $value) {
            $source .= "\ndefine('" . $name . "', " . var_export($value, true) . ');';
        }

        $source .= "\n";
    }

    return $source;
}

/**
 * `config [--config=PATH] [--show-secrets]` lists the current values;
 * `config --set KEY=VALUE [--set KEY=VALUE ...]` updates them in place.
 */
function sifpress_cli_config(string $configPath, array $options, array $argv): void
{
    if (!is_file($configPath)) {
        fwrite(STDERR, "No config found at {$configPath}. Run: php " . basename(__FILE__) . " setup\n");
        exit(1);
    }

    $sets = [];
    $args = array_slice($argv, 2);

    for ($i = 0; $i < count($args); $i++) {
        $arg = $args[$i];
        $pair = null;

        if (str_starts_with($arg, '--set=')) {
            $pair = substr($arg, 6);
        } elseif ($arg === '--set') {
            $pair = $args[$i + 1] ?? null;
            $i++;
        }

        if ($pair === null) {
            continue;
        }

        $eq = strpos($pair, '=');

        if ($eq === false || $eq === 0) {
            fwrite(STDERR, "Invalid --set, expected KEY=VALUE: {$pair}\n");
            exit(1);
        }

        $key = substr($pair, 0, $eq);

        if (preg_match('/^[A-Z][A-Z0-9_]*$/', $key) !== 1) {
            fwrite(STDERR, "Invalid config key: {$key}\n");
            exit(1);
        }

        $sets[$key] = substr($pair, $eq + 1);
    }

    require_once $configPath;

    $showSecrets = isset($options['show-secrets']);

    if ($sets === []) {
        $user = get_defined_constants(true)['user'] ?? [];

        foreach (sifpress_config_types() as $key => $type) {
            if (!array_key_exists($key, $user)) {
                continue;
            }

            $value = $user[$key];

            if (sifpress_config_secret($key) && !$showSecrets) {
                $display = $value === '' ? "''" : "'********'";
            } else {
                $display = var_export($value, true);
            }

            fwrite(STDOUT, "{$key} = {$display}\n");
        }

        return;
    }

    $values = [];

    try {
        foreach ($sets as $key => $raw) {
            $values[$key] = sifpress_config_cast($key, $raw);
        }
    } catch (Throwable $e) {
        fwrite(STDERR, $e->getMessage() . "\n");
        exit(1);
    }

    $source = file_get_contents($configPath);

    if ($source === false) {
        fwrite(STDERR, "Could not read {$configPath}\n");
        exit(1);
    }

    $patched = sifpress_config_patch($source, $values);

    if (@file_put_contents($configPath . '.bak', $source) === false) {
        fwrite(STDERR, "Could not write {$configPath}.bak\n");
        exit(1);
    }

    $tmp = $configPath . '.tmp.' . bin2hex(random_bytes(4));

    if (@file_put_contents($tmp, $patched) === false) {
        fwrite(STDERR, "Could not write {$tmp}\n");
        exit(1);
    }

    @chmod($tmp, fileperms($configPath) & 0777);

    if (!@rename($tmp, $configPath)) {
        @unlink($tmp);
        fwrite(STDERR, "Could not replace {$configPath}\n");
        exit(1);
    }

    sifpress_cli_adopt_owner($configPath);

    foreach ($values as $key => $value) {
        $display = sifpress_config_secret($key) && !$showSecrets
            ? '********'
            : var_export($value, true);

        fwrite(STDOUT, "{$key} = {$display}\n");
    }

    fwrite(STDOUT, "Updated {$configPath} (backup: {$configPath}.bak)\n");
}

/**
 * `version`: print the Sifpress version and the version of every installed
 * sifront. Needs an applied database (that is where sifronts live); with a
 * missing config/DB it prints the app version plus the command to fix that.
 */
function sifpress_cli_version(string $configPath): void
{
    $bin = basename(__FILE__);

    fwrite(STDOUT, APP_NAME . ' ' . APP_VERSION . "\n");
    fwrite(STDOUT, 'Artifact: ' . dirname(__FILE__) . "/{$bin}\n");

    if (!is_file($configPath)) {
        fwrite(STDOUT, "No config found. Run: php {$bin} setup\n");

        return;
    }

    require_once $configPath;

    $dbFile = rtrim(db_dir(), '/\\') . '/sys.db';

    if (!is_file($dbFile)) {
        fwrite(STDOUT, "No database yet. Run: php {$bin} migrate\n");

        return;
    }

    if (db_needs_migration()) {
        fwrite(STDOUT, "Database needs migration. Run: php {$bin} migrate\n");

        return;
    }

    $rows = db()->query(
        'SELECT id, name, version, bundle_size, is_virtual, length(content) AS html_size'
        . ' FROM sifronts ORDER BY id'
    )->fetchAll();

    if ($rows === []) {
        fwrite(STDOUT, "Sifronts: none installed\n");

        return;
    }

    $activeId = (string) setting_get('active_sifront_id', '');
    $nameWidth = 0;

    foreach ($rows as $row) {
        $nameWidth = max($nameWidth, mb_strlen((string) $row['name']));
    }

    fwrite(STDOUT, 'Sifronts (' . count($rows) . " installed):\n");

    foreach ($rows as $row) {
        $flags = [];

        if ((int) $row['is_virtual'] === 1) {
            $flags[] = 'virtual';
        } elseif ((int) $row['bundle_size'] === 0) {
            $flags[] = (int) $row['html_size'] > 0 ? 'legacy html' : 'no bundle';
        }

        if ((string) $row['id'] === $activeId) {
            $flags[] = 'active';
        }

        $name = (string) $row['name'];
        $version = trim((string) $row['version']);
        $padding = str_repeat(' ', max(0, $nameWidth - mb_strlen($name)));

        fwrite(
            STDOUT,
            '  ' . $name . $padding . '  ' . ($version !== '' ? $version : '-')
            . ($flags === [] ? '' : '  (' . implode(', ', $flags) . ')')
            . "\n"
        );
    }
}

function sifpress_cli_status(string $configPath): void
{
    $bin = basename(__FILE__);

    fwrite(STDOUT, 'Artifact: ' . dirname(__FILE__) . "/{$bin}\n");
    fwrite(STDOUT, 'Config:   ' . (is_file($configPath) ? $configPath : 'missing') . "\n");

    if (!is_file($configPath)) {
        fwrite(STDOUT, "Run: php {$bin} setup\n");

        return;
    }

    require_once $configPath;

    $dir = db_dir();
    $file = rtrim($dir, '/\\') . '/sys.db';

    fwrite(STDOUT, "DB dir:   {$dir}\n");
    fwrite(STDOUT, 'DB file:  ' . (is_file($file) ? $file : 'missing') . "\n");

    if (is_file($file)) {
        $v = db_version();
        fwrite(STDOUT, 'Migration: ' . count($v['applied']) . '/' . count($v['latest']) . "\n");
        sifpress_cli_adopt_db();
    }
}

/**
 * `rewrite`: generate the Apache/nginx rules that let the artifact be
 * addressed by clean paths, and/or check whether such rules are live.
 *
 *   rewrite [apache|nginx|both|check|status] [options]
 *
 * The rules hand every path that is not a real file to the artifact with the
 * requested route copied into ?p=, which is the dispatch src/router.php
 * already performs — the artifact keeps working without them, so installing
 * these is purely cosmetic (plus /robots.txt and /sitemap.xml).
 */
function sifpress_cli_rewrite(string $configPath, array $options, array $argv): void
{
    $bin = basename(__FILE__);

    if (!is_file($configPath)) {
        // The rules do not depend on the config, so keep going: warn instead.
        fwrite(STDERR, "No config found at {$configPath}; generating for defaults.\n");
    } else {
        require_once $configPath;
    }

    $sub = 'both';

    foreach (array_slice($argv, 2) as $arg) {
        if (str_starts_with($arg, '-')) {
            continue;
        }

        $sub = strtolower($arg);
        break;
    }

    if (!in_array($sub, ['apache', 'nginx', 'both', 'check', 'status'], true)) {
        fwrite(STDERR, "Unknown rewrite target: {$sub}\n");
        fwrite(STDERR, "Usage: php {$bin} rewrite [apache|nginx|both|check|status]\n");
        exit(1);
    }

    if (isset($options['forget'])) {
        fwrite(STDOUT, forget_pretty_urls()
            ? "Cleared the clean-path marker; links revert to ?p= on the next request.\n"
            : "No clean-path marker to clear.\n");

        /* `rewrite --forget` on its own is a maintenance action, not a
         * request for the rule text. */
        if ($sub === 'both') {
            $sub = '';
        }
    }

    if (isset($options['set-config'])) {
        sifpress_cli_config(
            $configPath,
            $options,
            array_merge([$bin, 'config'], ['--set=SIFPRESS_PRETTY_URLS=1'])
        );

        if ($sub === 'both') {
            $sub = '';
        }
    }

    if ($sub === '') {
        return;
    }

    $mount = sifpress_rewrite_mount($options);
    $base = sifpress_cli_option($options, 'base-url') ?? sifpress_rewrite_base_url();

    if ($sub === 'check') {
        sifpress_rewrite_check($mount, $base, $bin);
        return;
    }

    if ($sub === 'status') {
        sifpress_rewrite_status($mount, $base, $bin, $configPath);
        return;
    }

    $rules = sifpress_rewrite_rules($mount, $bin);
    $targets = $sub === 'both' ? ['apache', 'nginx'] : [$sub];
    $out = sifpress_cli_option($options, 'out');

    if ($out === null) {
        foreach ($targets as $target) {
            fwrite(STDOUT, "\n# ===== {$target} =====\n");
            fwrite(STDOUT, $rules[$target] . "\n");
        }

        return;
    }

    $isDir = is_dir($out);

    if (count($targets) > 1 && !$isDir) {
        fwrite(STDERR, "--out with two targets must be a directory (e.g. --out=.)\n");
        exit(1);
    }

    foreach ($targets as $target) {
        $path = $isDir
            ? rtrim($out, '/') . '/' . ($target === 'apache' ? '.htaccess' : 'sifpress-rewrite.conf')
            : $out;

        if (@file_put_contents($path, $rules[$target]) === false) {
            fwrite(STDERR, "Could not write {$path}\n");
            exit(1);
        }

        sifpress_cli_adopt_owner($path);
        fwrite(STDOUT, "Wrote {$target} rules to {$path}\n");
    }
}

/**
 * Mount path the rules are generated for: '' (document root) or '/app'.
 * Precedence: --base-path, SIFPRESS_PRETTY_BASE env, SIFPRESS_BASE_URL,
 * then the site_url setting.
 */
function sifpress_rewrite_mount(array $options): string
{
    $candidates = [];
    $explicit = sifpress_cli_option($options, 'base-path');

    if ($explicit !== null) {
        $candidates[] = $explicit;
    }

    $env = getenv('SIFPRESS_PRETTY_BASE');

    if (is_string($env) && trim($env) !== '') {
        $candidates[] = $env;
    }

    $candidates[] = defined('SIFPRESS_BASE_URL') ? (string) SIFPRESS_BASE_URL : '';
    $candidates[] = sifpress_rewrite_base_url();

    foreach ($candidates as $candidate) {
        $mount = sifpress_rewrite_mount_from($candidate);

        if ($mount !== null) {
            return $mount;
        }
    }

    return '';
}

/** Path component of a URL-ish string, or null when it carries none. */
function sifpress_rewrite_mount_from(string $value): ?string
{
    $value = trim($value);

    if ($value === '') {
        return null;
    }

    $path = parse_url($value, PHP_URL_PATH);
    $path = is_string($path) ? $path : '';

    if (str_starts_with($path, '/')) {
        $path = substr($path, 1);
    }

    $path = trim($path, '/');

    return $path === '' ? '' : '/' . $path;
}

/** Absolute base URL for the check probes, or '' when none is configured. */
function sifpress_rewrite_base_url(): string
{
    $configured = defined('SIFPRESS_BASE_URL') ? trim((string) SIFPRESS_BASE_URL) : '';

    if ($configured === '') {
        $env = getenv('SIFPRESS_BASE_URL');
        $configured = is_string($env) ? trim($env) : '';
    }

    if ($configured !== '' && str_starts_with($configured, 'http')) {
        return rtrim($configured, '/');
    }

    if (!db_needs_migration()) {
        $site = trim((string) setting_get('site_url', ''));

        if ($site !== '' && str_starts_with($site, 'http')) {
            return rtrim($site, '/');
        }
    }

    return '';
}

/** The generated rules for both servers. Mount path aware (nginx needs it). */
function sifpress_rewrite_rules(string $mount, string $bin): array
{
    $apache = <<<APACHE
    # Sifpress — clean-path URLs (generated by `php sifpress.php rewrite apache`).
    #
    # Place this file in the directory that holds {$bin}. Every path that is
    # not a real file is handed to the artifact with the requested route copied
    # into ?p= — the dispatch src/router.php already performs — so ?p= links
    # keep working unchanged and nothing breaks if this file is removed again.
    #
    # No RewriteBase is needed: the substitution is relative to this directory,
    # which is what makes the rules valid at any mount depth (/, /app, /a/b/c).
    #
    # Requires mod_rewrite, and either `AllowOverride FileInfo` for this
    # directory or the same directives inside a <Directory> block.

    <IfModule mod_rewrite.c>
        RewriteEngine On

        # Never touch real files: the artifact, sifpress_config.php, uploads…
        RewriteCond %{REQUEST_FILENAME} -f [OR]
        RewriteCond %{REQUEST_FILENAME} -d
        RewriteRule ^ - [L]

        # Conventional names for the SEO endpoints.
        RewriteRule ^robots\\.txt\$  {$bin}?p=sifpress/seo&action=robots  [QSA,L]
        RewriteRule ^sitemap\\.xml\$ {$bin}?p=sifpress/seo&action=sitemap [QSA,L]
        RewriteRule ^favicon\\.ico\$ {$bin}?p=sifpress/favicon             [QSA,L]

        # Everything else: /<route> -> {$bin}?p=/<route>
        RewriteRule ^(.*)\$ {$bin}?p=/\$1 [QSA,L]
    </IfModule>

    # Apache 2.4.8+ alternative with no mod_rewrite at all — the artifact then
    # reads the route from the request path itself:
    #
    #   FallbackResource /{$bin}
    APACHE;

    if ($mount === '') {
        $nginx = <<<NGINX
        # Sifpress — clean-path URLs (generated by `php sifpress.php rewrite nginx`).
        #
        # Paste inside your server {} block. If the vhost already has a
        # `location / { try_files … ; fastcgi_pass …; }`, replace only its
        # try_files line with the one from `location /` below.
        #
        #   /<route>  ->  /{$bin}?p=/<route>

        location = /robots.txt  { rewrite ^ /{$bin}?p=sifpress/seo&action=robots  last; }
        location = /sitemap.xml { rewrite ^ /{$bin}?p=sifpress/seo&action=sitemap last; }
        location = /favicon.ico { rewrite ^ /{$bin}?p=sifpress/favicon             last; }

        location / {
            try_files \$uri \$uri/ /{$bin}?p=\$uri;
        }

        # Two caveats:
        #   * the PHP handler must stay a `location ~ \\.php$` block (a `^~`
        #     prefix location would swallow it and serve .php as static);
        #   * do not keep a competing `try_files \$uri =404;` in that block.
        NGINX;
    } else {
        $prefix = $mount;

        $nginx = <<<NGINX
        # Sifpress — clean-path URLs (generated by `php sifpress.php rewrite nginx`).
        #
        # The artifact is mounted at {$prefix}, so these rules only cover that
        # subtree — anything else in the vhost keeps its own routing. Paste
        # inside your server {} block.
        #
        #   {$prefix}/<route>  ->  {$prefix}/{$bin}?p={$prefix}/<route>

        location = {$prefix} { return 301 {$prefix}/; }

        location = {$prefix}/robots.txt  { rewrite ^ {$prefix}/{$bin}?p=sifpress/seo&action=robots  last; }
        location = {$prefix}/sitemap.xml { rewrite ^ {$prefix}/{$bin}?p=sifpress/seo&action=sitemap last; }
        location = {$prefix}/favicon.ico { rewrite ^ {$prefix}/{$bin}?p=sifpress/favicon             last; }

        location {$prefix}/ {
            # \$uri keeps the {$prefix} prefix inside ?p=; the artifact strips its
            # own mount prefix, so no map or capture is needed here.
            try_files \$uri \$uri/ {$prefix}/{$bin}?p=\$uri;
        }

        # Two caveats:
        #   * the PHP handler must stay a `location ~ \\.php$` block (a `^~`
        #     prefix location would swallow it and serve .php as static);
        #   * do not keep a competing `try_files \$uri =404;` in that block.
        NGINX;
    }

    return ['apache' => dedent_block($apache), 'nginx' => dedent_block($nginx)];}

/** Strip the heredoc indentation used to keep this file readable. */
function dedent_block(string $text): string
{
    $lines = explode("\n", $text);
    $indent = null;

    foreach ($lines as $line) {
        if (trim($line) === '') {
            continue;
        }

        $pad = strlen($line) - strlen(ltrim($line, ' '));

        if ($indent === null || $pad < $indent) {
            $indent = $pad;
        }
    }

    if ($indent === null || $indent === 0) {
        return $text;
    }

    foreach ($lines as $i => $line) {
        $lines[$i] = substr($line, $indent);
    }

    return implode("\n", $lines);
}

/**
 * `rewrite status`: what the rules would target and what the artifact thinks
 * its current URL mode is.
 */
function sifpress_rewrite_status(string $mount, string $base, string $bin, string $configPath): void
{
    $mode = defined('SIFPRESS_PRETTY_URLS') ? trim((string) SIFPRESS_PRETTY_URLS) : '(unset)';
    $flag = pretty_urls_flag_path();

    fwrite(STDOUT, 'Artifact:      ' . dirname(__FILE__) . "/{$bin}\n");
    fwrite(STDOUT, 'Config:        ' . $configPath . "\n");
    fwrite(STDOUT, 'Mount path:    ' . ($mount === '' ? '/ (document root)' : $mount) . "\n");
    fwrite(STDOUT, 'Base URL:      ' . ($base === '' ? '(not configured)' : $base) . "\n");
    fwrite(STDOUT, 'SIFPRESS_PRETTY_URLS: ' . $mode . "\n");
    fwrite(STDOUT, 'Observed marker:    ' . $flag . (is_file($flag) ? ' (present)' : ' (absent)') . "\n");
    fwrite(STDOUT, 'Mode now:      ' . (pretty_urls_enabled() ? 'clean paths' : '?p= links') . "\n");
    fwrite(STDOUT, 'Emit mode:     ' . (defined('SIFPRESS_PRETTY_URLS')
        && in_array(strtolower(trim((string) SIFPRESS_PRETTY_URLS)), ['1', 'true', 'on', 'yes'], true)
        ? 'forced on (--forget will not change it)'
        : 'evidence-based (on after the first clean-path request)') . "\n");

    fwrite(STDOUT, "\nGenerate with: php {$bin} rewrite both"
        . ($mount === '' ? '' : " --base-path={$mount}") . "\n");

    if ($base !== '') {
        fwrite(STDOUT, "Verify with:   php {$bin} rewrite check\n");
    } else {
        fwrite(STDOUT, "Verify with:   php {$bin} rewrite check --base-url=https://example.com"
            . ($mount === '' ? '' : " --base-path={$mount}") . "\n");
    }
}

/**
 * `rewrite check`: probe the live URLs. The probes only ask whether the server
 * routed a clean path to the artifact — no app-side marker needed.
 */
function sifpress_rewrite_check(string $mount, string $base, string $bin): void
{
    if ($base === '') {
        fwrite(STDERR, "No base URL configured. Pass --base-url=https://example.com"
            . " or set SIFPRESS_BASE_URL / the site_url setting.\n");
        exit(1);
    }

    $root = rtrim($base, '/') . ($mount === '' ? '' : $mount);

    $probes = [
        ['API', $root . '/sifpress/api?action=system.status', 'json'],
        ['Admin shell', $root . '/sifpress/admin/login', 'html'],
        ['robots.txt', $root . '/robots.txt', 'text'],
        ['Sifront route', $root . '/this/route/does/not/exist', 'html'],
    ];

    fwrite(STDOUT, "Probing {$root}\n\n");
    $ok = true;

    foreach ($probes as [$label, $url, $expect]) {
        $res = sifpress_rewrite_probe($url);
        $pass = $res['status'] === 200 && match ($expect) {
            'json' => str_contains($res['body'], '"api":true'),
            'text' => str_contains($res['body'], 'User-agent:'),
            default => str_contains($res['body'], '<html'),
        };

        $ok = $ok && $pass;

        fwrite(STDOUT, sprintf(
            "  %s %-14s %-12s %s%s\n",
            $pass ? 'OK  ' : 'FAIL',
            $label,
            $res['status'] > 0 ? (string) $res['status'] : 'no response',
            $res['type'] === '' ? 'no content-type' : $res['type'],
            $res['status'] === 404
                ? ' — the web server did not route this path to ' . $bin
                : ''
        ));
    }

    fwrite(STDOUT, "\n");

    if ($ok) {
        fwrite(STDOUT, "Clean paths are live. The app switches to them by itself on the next\n"
            . "request (SIFPRESS_PRETTY_URLS = auto).\n");

        return;
    }

    fwrite(STDOUT, "Clean paths are not reachable yet:\n"
        . "  1. install the rules: php {$bin} rewrite both"
        . ($mount === '' ? '' : " --base-path={$mount}") . " --out=.\n"
        . "  2. reload the web server, then run: php {$bin} rewrite check\n"
        . "Until then the app keeps emitting ?p= links, which always work.\n");
}

/** One HTTP probe: status code, content type and a short body preview. */
function sifpress_rewrite_probe(string $url): array
{
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        return ['status' => 0, 'type' => '', 'body' => ''];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'GET',
            'timeout' => 5,
            'ignore_errors' => true,
            'follow_location' => 0,
            'header' => "Accept: */*\r\nUser-Agent: Sifpress-rewrite-check\r\n",
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    $status = 0;
    $type = '';

    foreach ($http_response_header ?? [] as $line) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m) === 1) {
            $status = (int) $m[1];
            continue;
        }

        if (stripos($line, 'content-type:') === 0) {
            $type = trim(explode(';', substr($line, 13))[0]);
        }
    }

    return [
        'status' => $status,
        'type' => $type,
        'body' => is_string($body) ? $body : '',
    ];
}

/**
 * chown a path to the running artifact's owner when invoked as root, so a
 * root-run `setup`/`migrate` leaves the web server able to read/write it.
 */
function sifpress_cli_adopt_owner(string $path): void
{
    if (!function_exists('posix_geteuid') || posix_geteuid() !== 0) {
        return;
    }

    $uid = @fileowner(__FILE__);
    $gid = @filegroup(__FILE__);

    if ($uid !== false) {
        @chown($path, $uid);
    }

    if ($gid !== false) {
        @chgrp($path, $gid);
    }
}

function sifpress_cli_adopt_db(): void
{
    if (!function_exists('posix_geteuid') || posix_geteuid() !== 0) {
        return;
    }

    $dir = db_dir();
    sifpress_cli_adopt_owner($dir);
    @chmod($dir, 0775);

    foreach (glob($dir . '/sys.db*') ?: [] as $file) {
        sifpress_cli_adopt_owner($file);
    }
}

/*
 * Dispatch last (cli.php is assembled after migrations.php) so the MIGRATIONS
 * constant exists by the time `migrate`/`status` run. bootstrap.php skipped the
 * web auto-generation for CLI, so nothing has created or required the config
 * yet when this runs.
 */
/**
 * `assets <subcommand>`: move asset bytes out of the database into the storage
 * backend, and report on the result.
 *
 *   assets status                     where every asset's bytes live right now
 *   assets migrate-blobs [--dry-run]  write each legacy BLOB row to storage
 *   assets verify [--sample=N]        md5 spot-check of stored objects
 *   assets gc                         delete objects no row points at
 *
 * The first release keeps the BLOBs (`--keep-blobs` defaults on) so a rollback
 * to the previous artifact still serves the bytes; pass `--keep-blobs=0` in a
 * later run to clear them, which is what actually shrinks sys.db (SQLite only
 * returns freed pages to the filesystem on VACUUM).
 */
function sifpress_cli_assets(string $configPath, array $options, array $argv): void
{
    if (!is_file($configPath)) {
        fwrite(STDERR, 'No config found. Run: php ' . basename(__FILE__) . " setup\n");
        exit(1);
    }

    require_once $configPath;

    if (db_needs_migration()) {
        fwrite(STDERR, 'Database needs migration. Run: php ' . basename(__FILE__) . " migrate\n");
        exit(1);
    }

    $action = 'status';

    foreach (array_slice($argv, 2) as $arg) {
        if (substr($arg, 0, 2) !== '--') {
            $action = strtolower(trim($arg));
            break;
        }
    }

    match ($action) {
        'status' => cli_assets_status(),
        'migrate-blobs', 'migrate' => cli_assets_migrate($options),
        'verify' => cli_assets_verify((int) ($options['sample'] ?? 20)),
        'gc' => cli_assets_gc(),
        'vacuum' => cli_assets_vacuum(),
        default => cli_assets_usage($action),
    };
}

function cli_assets_usage(string $action): void
{
    fwrite(
        STDERR,
        "Unknown assets action: {$action} (use status, migrate-blobs, verify or gc)\n"
    );
    exit(1);
}

/** Bytes still living in the database, and bytes already in storage. */
function cli_assets_totals(): array
{
    /* `length(data)`/`length(thumb)` disappear with the columns themselves. */
    $hasData = asset_column_exists('data');
    $hasThumb = asset_column_exists('thumb');

    $row = db()->query(
        "SELECT COUNT(*) AS total,
                SUM(CASE WHEN storage_key IS NULL THEN 1 ELSE 0 END) AS legacy,
                SUM(CASE WHEN storage_key IS NOT NULL THEN 1 ELSE 0 END) AS stored,"
        . ($hasData ? ' COALESCE(SUM(length(data)), 0) AS blob_bytes,' : ' 0 AS blob_bytes,')
        . ($hasThumb ? ' COALESCE(SUM(length(thumb)), 0) AS thumb_bytes,' : ' 0 AS thumb_bytes,')
        . " COALESCE(SUM(CASE WHEN storage_key IS NULL THEN size_bytes ELSE 0 END), 0) AS pending_bytes
           FROM assets"
    )->fetch();

    return [
        'total' => (int) $row['total'],
        'legacy' => (int) $row['legacy'],
        'stored' => (int) $row['stored'],
        'blob_bytes' => (int) $row['blob_bytes'],
        'thumb_bytes' => (int) $row['thumb_bytes'],
        'pending_bytes' => (int) $row['pending_bytes'],
    ];
}

function human_bytes(int $bytes): string
{
    $units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    $value = (float) $bytes;
    $i = 0;

    while ($value >= 1024 && $i < count($units) - 1) {
        $value /= 1024;
        $i++;
    }

    return ($i === 0 ? (string) (int) $value : sprintf('%.1f', $value)) . ' ' . $units[$i];
}

/** Objects referenced by a row but absent from storage, and vice versa. */
function cli_assets_reconcile(): array
{
    $missing = [];
    $diskBytes = 0;
    $referenced = [];

    foreach (db()->query('SELECT id, storage_key, thumb_key, storage FROM assets') as $row) {
        if ((string) ($row['storage'] ?? '') === '') {
            continue;
        }

        foreach ([(string) ($row['storage_key'] ?? ''), (string) ($row['thumb_key'] ?? '')] as $key) {
            if ($key === '') {
                continue;
            }

            $referenced[$key] = true;
            $path = asset_storage()->localPath($key);

            if ($path === null || !is_file($path)) {
                $missing[] = [(int) $row['id'], $key];
                continue;
            }

            $diskBytes += (int) filesize($path);
        }
    }

    $orphans = [];
    $dir = asset_dir();

    if (is_dir($dir)) {
        $it = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS)
        );

        foreach ($it as $file) {
            if (!$file->isFile()) {
                continue;
            }

            $path = $file->getPathname();
            $relative = ltrim(substr($path, strlen($dir)), '/');

            if (str_starts_with($relative, '.tmp/')) {
                continue;
            }

            if (!isset($referenced[$relative])) {
                $orphans[] = $relative;
                $diskBytes += (int) $file->getSize();
            }
        }
    }

    return ['missing' => $missing, 'orphans' => $orphans, 'disk_bytes' => $diskBytes];
}

function cli_assets_status(): void
{
    $totals = cli_assets_totals();
    $state = cli_assets_reconcile();

    fwrite(
        STDOUT,
        "Asset directory: " . asset_dir() . "\n"
        . 'Backend       : ' . asset_storage()->id() . "\n"
        . 'Playback      : ' . asset_handoff_label() . "\n\n"
        . sprintf("Rows          : %d total, %d in storage, %d legacy (blob)\n", $totals['total'], $totals['stored'], $totals['legacy'])
        . sprintf(
            "Bytes in DB   : %s (originals) + %s (thumbnails)\n",
            human_bytes($totals['blob_bytes']),
            human_bytes($totals['thumb_bytes'])
        )
        . sprintf("Bytes on disk : %s\n", human_bytes($state['disk_bytes']))
        . sprintf("Pending move  : %s\n", human_bytes($totals['pending_bytes']))
    );

    if ($state['missing'] !== []) {
        fwrite(STDOUT, "\nMissing objects (row points at a file that is gone):\n");

        foreach (array_slice($state['missing'], 0, 10) as [$id, $key]) {
            fwrite(STDOUT, "  asset {$id}: {$key}\n");
        }

        if (count($state['missing']) > 10) {
            fwrite(STDOUT, '  ... and ' . (count($state['missing']) - 10) . " more\n");
        }
    } else {
        fwrite(STDOUT, "Missing objects : none\n");
    }

    fwrite(
        STDOUT,
        'Orphan objects  : ' . count($state['orphans'])
        . ($state['orphans'] === [] ? "\n" : " (reclaim with `assets gc`)\n")
    );

    if ($state['orphans'] !== []) {
        foreach (array_slice($state['orphans'], 0, 5) as $key) {
            fwrite(STDOUT, "  {$key}\n");
        }
    }

    $blobColumns = asset_blob_columns();
    $cleanup = asset_blob_column_status();

    fwrite(
        STDOUT,
        'Legacy columns : '
        . ($blobColumns === [] ? 'dropped' : implode(', ', $blobColumns))
        . ($cleanup['reason'] === 'not run yet' ? '' : '  (' . $cleanup['reason'] . ')')
        . "\n"
    );

    if ($totals['legacy'] > 0) {
        fwrite(
            STDOUT,
            "\n" . $totals['legacy'] . " legacy row(s) still store bytes in the database.\n"
            . 'Move them with: php ' . basename(__FILE__) . " assets migrate-blobs\n"
        );
    } elseif ($blobColumns !== []) {
        fwrite(
            STDOUT,
            "\nEvery row points at stored bytes. Reclaim the space and drop the empty columns with:\n"
            . '  php ' . basename(__FILE__) . " assets migrate-blobs --keep-blobs=0\n"
            . "  php " . basename(__FILE__) . " migrate   # drops data/thumb once they are empty\n"
        );
    }
}

/**
 * Write every legacy BLOB row to storage and point the row at the new object.
 * Each row is independent and committed on its own, so an interrupted run
 * resumes where it stopped and a rollback to the previous artifact is still
 * possible while the BLOBs are kept.
 */
function cli_assets_migrate(array $options): void
{
    $dryRun = array_key_exists('dry-run', $options);
    $limit = isset($options['limit']) ? max(1, (int) $options['limit']) : PHP_INT_MAX;
    $keepBlobs = !array_key_exists('keep-blobs', $options) || (string) $options['keep-blobs'] !== '0';
    $vacuum = isset($options['vacuum']);

    $totals = cli_assets_totals();

    if (!asset_column_exists('data')) {
        fwrite(STDOUT, "Nothing to migrate: the legacy BLOB columns have already been dropped.\n");

        return;
    }

    if ($totals['legacy'] === 0) {
        fwrite(STDOUT, "Nothing to migrate: every row already points at stored bytes.\n");
        fwrite(
            STDOUT,
            "Finish the move with: php " . basename(__FILE__) . " assets migrate-blobs --keep-blobs=0\n"
        );

        return;
    }

    $pendingBytes = $totals['pending_bytes'] + $totals['thumb_bytes'];

    if ($dryRun) {
        fwrite(
            STDOUT,
            "Would migrate {$totals['legacy']} legacy row(s), about " . human_bytes($pendingBytes)
            . " of bytes into " . asset_dir() . ".\n"
            . ($keepBlobs
                ? "The BLOBs would be kept (pass --keep-blobs=0 to clear them).\n"
                : "The BLOBs would be cleared; add --vacuum to reclaim the disk space.\n")
        );

        $rows = db()->query(
            'SELECT id, name, size_bytes FROM assets WHERE storage_key IS NULL ORDER BY id LIMIT 50'
        )->fetchAll();

        foreach ($rows as $row) {
            fwrite(
                STDOUT,
                sprintf("  #%-5d %-40s %s\n", (int) $row['id'], (string) $row['name'], human_bytes((int) $row['size_bytes']))
            );
        }

        if ($totals['legacy'] > 50) {
            fwrite(STDOUT, '  ... and ' . ($totals['legacy'] - 50) . " more\n");
        }

        fwrite(STDOUT, "\nDry run: nothing was written.\n");

        return;
    }

    /*
     * Both copies exist while the BLOBs are kept, so the migration needs room
     * for the pending set on top of what is already there.
     */
    $free = @disk_free_space(asset_dir_ready());

    if ($free !== false && $free < $pendingBytes + 32 * 1024 * 1024) {
        fwrite(
            STDERR,
            'Not enough free disk space on the asset volume: ' . human_bytes((int) $free)
            . ' available, ' . human_bytes($pendingBytes) . " needed (plus 32 MiB headroom).\n"
            . "Nothing was migrated.\n"
        );
        exit(1);
    }

    fwrite(
        STDOUT,
        "Migrating {$totals['legacy']} legacy row(s), about " . human_bytes($pendingBytes) . "…\n"
    );

    $moved = 0;
    $skipped = 0;
    $failed = 0;
    $cleared = 0;

    while ($moved + $failed < $limit) {
        /* Name only the legacy columns this database still has (see §9 of the plan). */
        $blobColumns = asset_blob_columns();

        if (!in_array('data', $blobColumns, true)) {
            break;
        }

        $row = db()->query(
            'SELECT id, mime, thumb_mime, md5, size_bytes'
            . ($blobColumns === [] ? '' : ', ' . implode(', ', $blobColumns))
            . " FROM assets WHERE storage_key IS NULL AND data IS NOT NULL ORDER BY id LIMIT 1"
        )->fetch();

        if ($row === false) {
            break;
        }

        try {
            [$storage, $key, $etag] = cli_asset_store_blob(
                'data',
                (int) $row['id'],
                (string) $row['mime'],
                (int) $row['size_bytes'],
                (string) ($row['md5'] ?? '') !== '' ? (string) $row['md5'] : null
            );

            $thumbKey = null;

            if (
                in_array('thumb', $blobColumns, true)
                && isset($row['thumb'])
                && $row['thumb'] !== null
                && $row['thumb'] !== false
            ) {
                [, $thumbKey] = cli_asset_store_blob(
                    'thumb',
                    (int) $row['id'],
                    (string) ($row['thumb_mime'] ?? '') !== '' ? (string) $row['thumb_mime'] : 'image/webp',
                    null,
                    null
                );
            }

            $sets = ['storage = ?', 'storage_key = ?', 'storage_etag = ?'];
            $params = [$storage, $key, $etag];

            if ($thumbKey !== null) {
                $sets[] = 'thumb_key = ?';
                $params[] = $thumbKey;
            }

            $dropped = [];

            if (!$keepBlobs) {
                foreach ($blobColumns as $column) {
                    $sets[] = $column . ' = NULL';
                    $dropped[] = $column;
                }
            }

            $params[] = (int) $row['id'];
            db()->prepare('UPDATE assets SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($params);

            /* Only count what actually landed, so a failure cannot inflate it. */
            $cleared += count($dropped) > 0 ? 1 : 0;
            $moved++;
            fwrite(STDOUT, sprintf("  #%-5d -> %s\n", (int) $row['id'], $key));
        } catch (Throwable $e) {
            $failed++;
            fwrite(
                STDERR,
                sprintf("  #%d failed: %s\n", (int) $row['id'], $e->getMessage())
            );

            if ($failed > 20) {
                fwrite(STDERR, "Too many failures, stopping.\n");
                break;
            }
        }
    }

    sifpress_cli_adopt_db();
    sifpress_cli_adopt_owner(asset_dir_ready());

    fwrite(
        STDOUT,
        "\nMigrated {$moved} row(s)" . ($failed > 0 ? ", {$failed} failed" : '') . ".\n"
    );

    if (!$keepBlobs && $cleared > 0) {
        fwrite(
            STDOUT,
            "Cleared the asset BLOB data from {$cleared} row(s). SQLite only returns the freed\n"
            . "pages to the filesystem on VACUUM. Reclaim them with:\n"
            . '  php ' . basename(__FILE__) . ' assets vacuum' . "\n"
        );

        if ($vacuum) {
            cli_assets_vacuum();
        }
    }
}

/**
 * Reclaim the pages freed by dropping the asset BLOBs. VACUUM rewrites the
 * whole database under a brief exclusive lock, so it is a deliberate,
 * operator-triggered step rather than something every `migrate` does.
 */
function cli_assets_vacuum(): void
{
    $path = db_path();
    $before = (int) @filesize($path);

    /* Fold the WAL back in first, so the number reported is the real file. */
    db()->exec('PRAGMA wal_checkpoint(TRUNCATE)');
    db()->exec('VACUUM');

    clearstatcache(true, $path);
    $after = (int) @filesize($path);

    fwrite(
        STDOUT,
        'VACUUM: sys.db ' . human_bytes($before) . ' -> ' . human_bytes($after)
        . ($after < $before ? ' (' . human_bytes($before - $after) . " reclaimed)\n" : " (already compact)\n")
    );
}

/**
 * Stream one BLOB column of a row into storage without buffering it, verify
 * it against the recorded size / md5, and return the new storage values.
 *
 * @return array{0:string,1:string,2:string}
 */
function cli_asset_store_blob(string $column, int $id, string $mime, ?int $expectedSize, ?string $expectedMd5): array
{
    if (!asset_column_exists($column)) {
        throw new RuntimeException("column {$column} no longer exists on assets");
    }

    $stmt = db()->prepare("SELECT {$column} FROM assets WHERE id = ?");
    $stmt->bindColumn(1, $blob, PDO::PARAM_LOB);
    $stmt->execute([$id]);
    $stmt->fetch(PDO::FETCH_BOUND);

    $tmp = tempnam(sys_get_temp_dir(), 'sifpress-asset-');

    if ($tmp === false) {
        throw new RuntimeException('Cannot create a temp file for the blob.');
    }

    try {
        $out = fopen($tmp, 'wb');

        if ($out === false) {
            throw new RuntimeException('Cannot open the temp file.');
        }

        if (is_resource($blob)) {
            /* Stream the LOB out in chunks: fpassthru() has no destination
             * parameter in PHP 8, and a 200 MB blob must not be buffered. */
            rewind($blob);

            while (!feof($blob)) {
                $chunk = fread($blob, 1048576);

                if ($chunk === false || $chunk === '') {
                    break;
                }

                fwrite($out, $chunk);
            }
        } elseif (is_string($blob)) {
            fwrite($out, $blob);
        }

        fclose($out);

        clearstatcache(true, $tmp);
        $size = (int) filesize($tmp);

        if ($expectedSize !== null && $size !== $expectedSize) {
            throw new RuntimeException(
                "blob is {$size} bytes, row says {$expectedSize}"
            );
        }

        $md5 = md5_file($tmp);

        if ($expectedMd5 !== null && $md5 !== $expectedMd5) {
            throw new RuntimeException("blob md5 {$md5} does not match the row");
        }

        [$storage, $key, , ] = asset_store_file($tmp, $mime);

        return [$storage, $key, $md5];
    } finally {
        @unlink($tmp);
    }
}

/** md5 spot-check of stored objects against the row's recorded digest. */
function cli_assets_verify(int $sample): void
{
    $storage = asset_storage();

    if (!method_exists($storage, 'hash')) {
        fwrite(STDOUT, "Backend '{$storage->id()}' cannot hash objects; nothing to verify.\n");

        return;
    }

    $rows = db()->query(
        'SELECT id, storage_key, md5 FROM assets WHERE storage_key IS NOT NULL ORDER BY id LIMIT '
        . max(1, $sample)
    )->fetchAll();

    if ($rows === []) {
        fwrite(STDOUT, "No stored objects to verify.\n");

        return;
    }

    $bad = 0;

    foreach ($rows as $row) {
        $actual = $storage->hash((string) $row['storage_key']);
        $expected = (string) ($row['md5'] ?? '');

        if ($actual === null) {
            fwrite(STDERR, "  asset #{$row['id']}: object missing\n");
            $bad++;
            continue;
        }

        if ($expected !== '' && $actual !== $expected) {
            fwrite(STDERR, "  asset #{$row['id']}: md5 {$actual} != row {$expected}\n");
            $bad++;
            continue;
        }

        fwrite(STDOUT, "  asset #{$row['id']}: {$actual} ok\n");
    }

    fwrite(STDOUT, "\nChecked " . count($rows) . " object(s), {$bad} problem(s).\n");

    if ($bad > 0) {
        exit(1);
    }
}

/** Delete stored objects that no row points at, and stale temp files. */
function cli_assets_gc(): void
{
    $state = cli_assets_reconcile();
    $removed = 0;

    foreach ($state['orphans'] as $key) {
        asset_storage()->delete($key);
        $removed++;
    }

    /* Abandoned chunked uploads: expired rows and their staged bytes. */
    $uploads = 0;

    while (($n = asset_upload_purge_expired(100)) > 0) {
        $uploads += $n;

        if ($n < 100) {
            break;
        }
    }

    /* Abandoned temp files from an interrupted put(). */
    $tmpDir = asset_dir() . '/.tmp';
    $cutoff = time() - 3600;

    foreach (glob($tmpDir . '/*.incoming') ?: [] as $path) {
        if (is_file($path) && (int) filemtime($path) < $cutoff) {
            @unlink($path);
            $removed++;
        }
    }

    fwrite(
        STDOUT,
        "Removed {$removed} orphan object(s) and {$uploads} expired upload(s).\n"
        . ($state['missing'] !== []
            ? count($state['missing']) . " row(s) point at a missing object; see `assets status`.\n"
            : "No rows point at a missing object.\n")
    );
}

if (PHP_SAPI === 'cli') {
    sifpress_cli($argv ?? []);
}
