/**
 * ------------------------------------------------------------
 * PHP environment requirements
 *
 * This fragment is assembled first, ahead of config loading and any database
 * access, so a host that is missing a required PHP extension gets one clear,
 * actionable message instead of an obscure fatal error buried in a request
 * handler.
 *
 * The rest of the artifact is written in PHP 8.1 syntax (the `never` return
 * type), so 8.1 is the hard floor regardless of this check.
 * ------------------------------------------------------------
 */

/** Minimum supported PHP version. */
const SIFPRESS_MIN_PHP_VERSION = '8.1.0';

/**
 * Required PHP extensions: name => what the app uses it for. Extensions
 * used only behind a function_exists() guard (curl, zlib) are optional and
 * deliberately not listed here.
 *
 * @return array<string, string>
 */
function sifpress_required_extensions(): array
{
    return [
        'pdo_sqlite' => 'the SQLite database backend',
        'mbstring' => 'multi-byte (Unicode) text handling',
        'fileinfo' => 'uploaded file MIME detection',
    ];
}

/**
 * Probe the SQLite library for FTS5 full-text search support using a
 * throwaway in-memory database, so the real database is never touched.
 */
function sifpress_sqlite_has_fts5(): bool
{
    try {
        $pdo = new PDO('sqlite::memory:');
        $pdo->exec('CREATE VIRTUAL TABLE sifpress_fts5_probe USING fts5(x)');
        $pdo = null;

        return true;
    } catch (Throwable $e) {
        return false;
    }
}

/**
 * Every unmet requirement, as human-readable sentences. Empty when the
 * environment is fine.
 *
 * @return list<string>
 */
function sifpress_env_problems(): array
{
    $problems = [];

    if (version_compare(PHP_VERSION, SIFPRESS_MIN_PHP_VERSION, '<')) {
        $problems[] = 'PHP ' . SIFPRESS_MIN_PHP_VERSION
            . ' or newer is required; this server runs PHP ' . PHP_VERSION . '.';
    }

    foreach (sifpress_required_extensions() as $extension => $purpose) {
        if (!extension_loaded($extension)) {
            $problems[] = 'The "' . $extension
                . '" PHP extension is missing (needed for ' . $purpose . ').';
        }
    }

    if (extension_loaded('pdo_sqlite') && !sifpress_sqlite_has_fts5()) {
        $problems[] = 'The SQLite library available to PHP was built without '
            . 'FTS5 full-text search support.';
    }

    return $problems;
}

/**
 * Best-effort, platform-specific install hints for the requirements above.
 *
 * @return list<string>
 */
function sifpress_env_install_hints(): array
{
    return [
        'Debian / Ubuntu:      sudo apt install php-mbstring php-sqlite3 php-fileinfo',
        'RHEL / Fedora / Alma: sudo dnf install php-mbstring php-pdo php-fileinfo',
        'macOS (Homebrew):     brew install php   # mbstring, fileinfo and sqlite ship with it',
        'Then restart PHP-FPM (or Apache) and reload this page.',
    ];
}

/**
 * Print the failure and stop. The CLI gets plain text on stderr; the web
 * gets a minimal HTML page (503 Service Unavailable).
 */
function sifpress_env_fail(array $problems): void
{
    $lines = array_merge(
        ['Sifpress cannot start: the PHP environment does not meet its requirements.', ''],
        array_map(static function (string $problem): string {
            return '  - ' . $problem;
        }, $problems),
        [''],
        sifpress_env_install_hints()
    );

    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, "\n" . implode("\n", $lines) . "\n\n");
        exit(1);
    }

    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    header('Cache-Control: no-store');
    header('Retry-After: 3600');
    header('X-Content-Type-Options: nosniff');

    $escape = static function (string $value): string {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    };

    echo '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width, initial-scale=1">'
        . '<title>Sifpress &mdash; server requirements not met</title>'
        . '<style>'
        . 'body{font:16px/1.6 system-ui,-apple-system,sans-serif;max-width:44rem;'
        . 'margin:4rem auto;padding:0 1.25rem;color:#1f2933}'
        . 'h1{font-size:1.35rem;margin:0 0 .5rem}'
        . 'p{margin:.5rem 0}'
        . 'ul{margin:.5rem 0;padding-left:1.25rem}'
        . 'li{margin:.35rem 0}'
        . 'pre{font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;'
        . 'background:#f3f4f6;border:1px solid #e5e7eb;border-radius:8px;'
        . 'padding:.85rem 1rem;overflow-x:auto;white-space:pre-wrap}'
        . '</style></head><body>'
        . '<h1>Sifpress cannot start</h1>'
        . '<p>The PHP environment on this server does not meet Sifpress&rsquo; requirements:</p>'
        . '<ul>';

    foreach ($problems as $problem) {
        echo '<li>' . $escape($problem) . '</li>';
    }

    echo '</ul><p>Install the missing pieces, then reload this page:</p><pre>';

    foreach (sifpress_env_install_hints() as $hint) {
        echo $escape($hint) . "\n";
    }

    echo '</pre></body></html>';

    exit;
}

$sifpress_env_problems = sifpress_env_problems();

if ($sifpress_env_problems !== []) {
    sifpress_env_fail($sifpress_env_problems);
}
