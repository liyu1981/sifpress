/**
 * Serve a shared ui-sdk chunk (`?p=sifpress/asset/js/<file>`).
 *
 * The core bundle (`ui-sdk.mjs`) contains React, ReactDOM, the common
 * libraries, and the whole ui-sdk API. Optional heavy libraries (mermaid,
 * KaTeX, highlight.js) are built as separate self-contained chunks and
 * loaded on demand by the client; they are embedded into the artifact by
 * build.php as UI_SDK_CHUNKS and served here.
 */
function serve_ui_sdk(string $file): never
{
    $file = basename($file);
    $chunks = defined('UI_SDK_CHUNKS') && is_array(UI_SDK_CHUNKS) ? UI_SDK_CHUNKS : [];

    if (!array_key_exists($file, $chunks)) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        header('X-Content-Type-Options: nosniff');
        echo 'ui-sdk chunk not found';
        exit;
    }

    header('Content-Type: application/javascript; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: public, max-age=31536000, immutable');

    serve_encoded_text((string) $chunks[$file]);
}

/**
 * Emit a text body, gzip-compressed when the client accepts it. The embedded
 * JS/CSS chunks are served `immutable`, so compression runs only on a cache
 * miss; `Vary` keeps shared caches from mixing encodings.
 */
function serve_encoded_text(string $content): never
{
    $accept = $_SERVER['HTTP_ACCEPT_ENCODING'] ?? '';

    header('Vary: Accept-Encoding');

    if ($content !== '' && str_contains($accept, 'gzip') && function_exists('gzencode')) {
        $compressed = gzencode($content, 6);

        if ($compressed !== false && strlen($compressed) < strlen($content)) {
            header('Content-Encoding: gzip');
            $content = $compressed;
        }
    }

    header('Content-Length: ' . strlen($content));
    echo $content;
    exit;
}
