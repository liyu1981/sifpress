<?php
declare(strict_types=1);

/**
 * Build the React application, inline all its assets into the HTML,
 * and embed that HTML into index.php.
 *
 * Usage:
 *
 *   php build.php
 *
 * Production artifact:
 *
 *   index.php
 *
 * The generated file can be copied to:
 *
 *   /
 *   /myapp/
 *   /tools/myapp/
 *
 * without rebuilding and WITHOUT any rewrite rules (.htaccess / Nginx
 * try_files / etc.). All JavaScript and CSS is inlined, so the browser
 * makes exactly one request.
 */

$root = __DIR__;
$frontend = $root . '/frontend';
$dist = $frontend . '/dist';
$index = $root . '/index.php';

function run(string $command, string $cwd): void
{
    echo '$ ' . $command . PHP_EOL;

    $descriptor = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $process = proc_open($command, $descriptor, $pipes, $cwd);

    if (!is_resource($process)) {
        throw new RuntimeException("Could not execute: $command");
    }

    fclose($pipes[0]);

    $stdout = stream_get_contents($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);

    fclose($pipes[1]);
    fclose($pipes[2]);

    $exitCode = proc_close($process);

    echo $stdout;

    if ($stderr !== '') {
        fwrite(STDERR, $stderr);
    }

    if ($exitCode !== 0) {
        throw new RuntimeException(
            "Command failed with exit code $exitCode: $command"
        );
    }
}

/**
 * Inline every stylesheet and script that references a built asset
 * in dist/. The result is a fully self-contained HTML document.
 */
function inline_assets(string $html, string $dist): string
{
    $html = preg_replace_callback(
        '/<link\b[^>]*\bhref="([^"]+)"[^>]*>/i',
        function (array $match) use ($dist): string {
            $tag = $match[0];
            $href = $match[1];

            // Only inline stylesheets that point into dist/assets/.
            if (!str_contains($tag, 'stylesheet') || !str_contains($href, 'assets/')) {
                return $tag;
            }

            $file = $dist . '/' . ltrim(html_entity_decode($href), './');

            if (!is_file($file)) {
                return $tag;
            }

            $css = file_get_contents($file);

            if ($css === false) {
                return $tag;
            }

            return '<style>' . $css . '</style>';
        },
        $html
    );

    if ($html === null) {
        throw new RuntimeException('Could not inline stylesheets');
    }

    $html = preg_replace_callback(
        '/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/i',
        function (array $match) use ($dist): string {
            $tag = $match[0];
            $src = $match[1];

            // Only inline scripts that point into dist/assets/.
            if (!str_contains($src, 'assets/')) {
                return $tag;
            }

            $file = $dist . '/' . ltrim(html_entity_decode($src), './');

            if (!is_file($file)) {
                return $tag;
            }

            $js = file_get_contents($file);

            if ($js === false) {
                return $tag;
            }

            // Keep type/crossorigin attributes; drop the src attribute.
            // The opening tag has no closing part, so append the JS and
            // a single closing tag.
            $cleaned = preg_replace('/\bsrc="[^"]*"/i', '', $tag);

            return $cleaned . $js . '</script>';
        },
        $html
    );

    if ($html === null) {
        throw new RuntimeException('Could not inline scripts');
    }

    return $html;
}

if (!is_dir($frontend)) {
    throw new RuntimeException('frontend directory not found');
}

if (!is_dir($frontend . '/node_modules')) {
    run('npm install', $frontend);
}

run('npm run build', $frontend);

if (!is_dir($dist)) {
    throw new RuntimeException('Vite dist directory was not generated');
}

$indexSource = file_get_contents($index);

if ($indexSource === false) {
    throw new RuntimeException('Could not read index.php');
}

$html = file_get_contents($dist . '/index.html');

if ($html === false) {
    throw new RuntimeException('Could not read dist/index.html');
}

/*
 * Normalize Vite's relative ./assets/... references. Inlining below
 * only matches assets/..., so "./assets/foo.js" matches too, but keep
 * the HTML tidy by canonicalizing the prefix.
 */
$html = preg_replace(
    '#(?:\./)?assets/#',
    'assets/',
    $html
);

if ($html === null) {
    throw new RuntimeException('Could not normalize asset URLs');
}

/*
 * Inline all JS and CSS so the document is fully self-contained.
 * The static title is stripped; PHP injects a route-aware title.
 */
$html = inline_assets($html, $dist);
$html = preg_replace('/<title[^>]*>.*?<\/title>/is', '', $html);

if ($html === null) {
    throw new RuntimeException('Could not strip the static title');
}

/*
 * The HTML is injected into the PHP source as a single-quoted
 * PHP string via var_export(), so arbitrary HTML is safe here.
 */
$htmlPhp = var_export($html, true);

/*
 * Inject the fully inlined HTML into the delimited region.
 * preg_replace_callback returns the literal replacement directly,
 * so unlike a string replacement there is no $/backslash processing.
 * This is also idempotent: it works whether the region currently
 * holds the marker or an earlier build's HTML.
 */
$count = 0;
$indexSource = preg_replace_callback(
    '#// ___BEGIN_EMBEDDED___\n.*?// ___END_EMBEDDED___#s',
    function () use ($htmlPhp): string {
        return "// ___BEGIN_EMBEDDED___\nconst EMBEDDED_HTML = " .
            $htmlPhp . ";\n// ___END_EMBEDDED___";
    },
    $indexSource,
    1,
    $count
);

if ($count !== 1) {
    throw new RuntimeException(
        'Could not find the embedded HTML region (matched ' . $count . ')'
    );
}

if (file_put_contents($index, $indexSource) === false) {
    throw new RuntimeException('Could not write index.php');
}

echo PHP_EOL;
echo "Build complete." . PHP_EOL;
echo "Production artifact: index.php" . PHP_EOL;
echo PHP_EOL;
echo "No .htaccess, no rewrite rules are required." . PHP_EOL;
echo "Routes: /index.php?u=...   API: /index.php?module=api&action=..." . PHP_EOL;