<?php
declare(strict_types=1);

/**
 * Build the React application and embed its generated assets into index.php.
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
 * without rebuilding.
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

$assetMap = [];

$iterator = new RecursiveIteratorIterator(
    new RecursiveDirectoryIterator(
        $dist,
        FilesystemIterator::SKIP_DOTS
    )
);

foreach ($iterator as $file) {
    if (!$file->isFile()) {
        continue;
    }

    $absolute = $file->getPathname();

    if (basename($absolute) === 'index.html') {
        continue;
    }

    $relative = substr($absolute, strlen($dist));

    $url = '/assets' . str_replace(
        DIRECTORY_SEPARATOR,
        '/',
        $relative
    );

    $contents = file_get_contents($absolute);

    if ($contents === false) {
        throw new RuntimeException("Could not read $absolute");
    }

    $extension = strtolower(pathinfo($absolute, PATHINFO_EXTENSION));

    $mime = match ($extension) {
        'js', 'mjs' => 'application/javascript',
        'css' => 'text/css',
        'json' => 'application/json',
        'svg' => 'image/svg+xml',
        'png' => 'image/png',
        'jpg', 'jpeg' => 'image/jpeg',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'woff' => 'font/woff',
        'woff2' => 'font/woff2',
        'ttf' => 'font/ttf',
        'wasm' => 'application/wasm',
        default => 'application/octet-stream',
    };

    $assetMap[$url] = [
        'mime' => $mime,
        'data' => base64_encode($contents),
    ];
}

$html = file_get_contents($dist . '/index.html');

if ($html === false) {
    throw new RuntimeException('Could not read dist/index.html');
}

/*
 * Vite base="./" normally emits:
 *
 *   ./assets/index-xxxx.js
 *
 * Normalize those references to the application's internal
 * /assets/... namespace. PHP will prepend the real mount path
 * conceptually by resolving requests relative to SCRIPT_NAME.
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
 * The HTML is injected into the PHP source as a single-quoted
 * PHP string via var_export(), so arbitrary HTML is safe here.
 */
$htmlPhp = var_export($html, true);
$assetPhp = var_export($assetMap, true);

$assetsPattern =
    '/const EMBEDDED_ASSETS = \[\s*\/\/ BUILD_ASSETS\s*\];/s';

$indexSource = preg_replace(
    $assetsPattern,
    'const EMBEDDED_ASSETS = ' . $assetPhp . ';',
    $indexSource,
    1,
    $count
);

if ($count !== 1) {
    throw new RuntimeException('Could not find BUILD_ASSETS marker');
}

$htmlPattern =
    '/const EMBEDDED_HTML = <<\x27HTML\x27;\n<!-- BUILD_HTML -->\nHTML;/s';

$indexSource = preg_replace(
    $htmlPattern,
    'const EMBEDDED_HTML = ' . $htmlPhp . ';',
    $indexSource,
    1,
    $count
);

if ($count !== 1) {
    throw new RuntimeException('Could not find BUILD_HTML marker');
}

if (file_put_contents($index, $indexSource) === false) {
    throw new RuntimeException('Could not write index.php');
}

echo PHP_EOL;
echo "Build complete." . PHP_EOL;
echo "Production artifact: index.php" . PHP_EOL;
echo PHP_EOL;
echo "The generated index.php is mount-point independent." . PHP_EOL;
echo "It can be copied to /, /myapp/, or any deeper directory." . PHP_EOL;
