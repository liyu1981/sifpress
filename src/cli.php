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
        sifpress_cli_adopt_db();

        return;
    }

    $applied = db_migrate_and_seed();

    fwrite(STDOUT, 'Applied ' . count($applied) . " migration(s):\n");

    foreach ($applied as $version) {
        fwrite(STDOUT, "  - {$version}\n");
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

    sifpress_cli_adopt_db();

    fwrite(STDOUT, "Password updated for '{$username}'. Sign in with the new password.\n");
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
if (PHP_SAPI === 'cli') {
    sifpress_cli($argv ?? []);
}
