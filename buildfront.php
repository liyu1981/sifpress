<?php
declare(strict_types=1);

/**
 * Build every sifront SPA (each a pnpm workspace package under sifronts/)
 * into a single self-contained HTML bundle: dist/<name>.sifront.
 *
 * Usage:
 *
 *   php buildfront.php          dev bundle    (unminified + embedded sourcemap)
 *   php buildfront.php release  release bundle (minified)
 *
 * Shares the build/inlining helpers with build.php (build_common.php).
 * This script does NOT touch the PHP artifact (dist/index.php /
 * dist/sifpress.php) — use build.php for that.
 *
 * The bundle keeps its static <title>: a sifront is served verbatim,
 * with no server-side meta injection.
 */

$root = __DIR__;
$outputDir = $root . '/dist';

$mode = $argv[1] ?? 'dev';

if ($mode === 'release' || $mode === 'rel') {
    $isRelease = true;
} else {
    $isRelease = false;
    $mode = 'dev';
}

$buildCommand = $isRelease ? 'pnpm run build:release' : 'pnpm run build:dev';

require __DIR__ . '/build_common.php';

/**
 * Build one sifront SPA and bundle its Vite output into a single
 * self-contained HTML document written to <outputDir>/<name>.sifront.
 * Uses the same inlining logic as the admin bundle in build.php.
 */
function build_sifront(string $appDir, string $outputDir, string $buildCommand, bool $dev): void
{
    $name = basename($appDir);
    $dist = $appDir . '/dist';

    if (!is_dir($appDir . '/node_modules')) {
        run('pnpm install', $appDir);
    }

    run($buildCommand, $appDir);

    $html = file_get_contents($dist . '/index.html');

    if ($html === false) {
        throw new RuntimeException("Could not read $name/dist/index.html");
    }

    $html = preg_replace('#(?:\./)?assets/#', 'assets/', $html);

    if ($html === null) {
        throw new RuntimeException("Could not normalize asset URLs for $name");
    }

    /*
     * Inject the shared ui-sdk module script into <head> before the app
     * bundle. The sifront externalizes React / common libs / ui-sdk to
     * `window.SifpressUI`, which this tag provides (served by the backend
     * at ?p=sifpress/asset/js/ui-sdk.mjs).
     */
    $uiSdkScript = '<script type="module" src="?p=sifpress/asset/js/ui-sdk.mjs"></script>';
    $pos = strpos($html, '<head>');
    if ($pos !== false) {
        $html = substr_replace($html, '<head>' . $uiSdkScript, $pos, strlen('<head>'));
    }

    $html = inline_assets($html, $dist, $dev);

    $output = $outputDir . '/' . $name . '.sifront';

    if (file_put_contents($output, $html) === false) {
        throw new RuntimeException("Could not write $output");
    }

    echo "Sifront bundle: $output" . PHP_EOL;
}

$sifrontApps = glob($root . '/sifronts/*', GLOB_ONLYDIR);

if ($sifrontApps === false || $sifrontApps === []) {
    throw new RuntimeException('No sifront packages found under sifronts/');
}

foreach ($sifrontApps as $sifrontApp) {
    if (!is_file($sifrontApp . '/package.json')) {
        continue;
    }

    build_sifront($sifrontApp, $outputDir, $buildCommand, !$isRelease);
}

echo PHP_EOL;
echo 'Build complete.' . PHP_EOL;
echo 'Mode: ' . $mode . PHP_EOL;
echo PHP_EOL;
echo 'Bundles are self-contained HTML chunks, ready to be stored/served as a sifront.' . PHP_EOL;
