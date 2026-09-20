/**
 * ------------------------------------------------------------
 * CLI
 *
 *   php sifpress.php [command] [options]
 *
 *   setup            (default) write sifpress_config.php + create the DB folder
 *   migrate          apply pending migrations
 *   change_password  set a user's password (clears must_change_password)
 *   status           print paths, version and migration state
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
    $configPath = dirname(__FILE__) . '/sifpress_config.php';

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

        case 'status':
            sifpress_cli_status($configPath);
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
        '  status           print paths, version and migration state',
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
