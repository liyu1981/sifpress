<?php
declare(strict_types=1);

/**
 * Shared helpers for the build scripts (build.php, buildfront.php).
 * No main flow here — each script drives its own pipeline.
 */

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
function inline_assets(string $html, string $dist, bool $dev): string
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

            /*
             * Inline any font/asset referenced via url() so the
             * artifact stays fully self-contained (fonts are emitted
             * as separate files by Vite and cannot be fetched after
             * the HTML is inlined into a single PHP file).
             */
            $css = preg_replace_callback(
                '/url\(\s*(?:"([^"]+)"|\'([^\']+)\'|([^)\s]*?))\s*\)/i',
                function (array $m) use ($dist, $file): string {
                    $url = $m[1] !== '' ? $m[1] : ($m[2] !== '' ? $m[2] : trim($m[3]));

                    if ($url === '' || str_starts_with($url, 'data:') || str_starts_with($url, 'http')) {
                        return $m[0];
                    }

                    $candidate = null;

                    if (str_starts_with($url, './')) {
                        $candidate = dirname($file) . '/' . substr($url, 2);
                    } elseif (str_starts_with($url, 'assets/')) {
                        $candidate = $dist . '/' . $url;
                    }

                    $candidate = $candidate !== null ? realpath($candidate) : false;

                    if ($candidate === false || !is_file($candidate)) {
                        return $m[0];
                    }

                    $mime = match (pathinfo($candidate, PATHINFO_EXTENSION)) {
                        'woff2' => 'font/woff2',
                        'woff' => 'font/woff',
                        'ttf' => 'font/ttf',
                        'otf' => 'font/otf',
                        'eot' => 'application/vnd.ms-fontobject',
                        'svg' => 'image/svg+xml',
                        'png' => 'image/png',
                        'jpg', 'jpeg' => 'image/jpeg',
                        'gif' => 'image/gif',
                        'webp' => 'image/webp',
                        default => 'application/octet-stream',
                    };

                    $data = file_get_contents($candidate);

                    if ($data === false) {
                        return $m[0];
                    }

                    return 'url("data:' . $mime . ';base64,' . base64_encode($data) . '")';
                },
                $css
            );

            if ($css === null) {
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
        function (array $match) use ($dist, $dev): string {
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

            $js = $cleaned . $js . '</script>';

            // Dev builds carry a source map. Embed it as a data URI so the
            // inlined bundle still resolves readable stack traces no matter
            // where the single file is served from.
            if ($dev && preg_match('/\/\/# sourceMappingURL=(index-[A-Za-z0-9_-]+\.js\.map)/', $js, $m)) {
                $map = $dist . '/assets/' . $m[1];
                if (is_file($map)) {
                    $data = file_get_contents($map);
                    if ($data !== false) {
                        $uri = 'data:application/json;charset=utf-8;base64,' . base64_encode($data);
                        $js = str_replace('//# sourceMappingURL=' . $m[1], '//# sourceMappingURL=' . $uri, $js);
                    }
                }
            }

            return $js;
        },
        $html
    );

    if ($html === null) {
        throw new RuntimeException('Could not inline scripts');
    }

    return $html;
}
