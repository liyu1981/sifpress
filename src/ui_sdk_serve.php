/**
 * Serve the shared ui-sdk bundle (`?p=sifpress/asset/js/ui-sdk.mjs`).
 *
 * The bundle contains React, ReactDOM, the common libraries, and the whole
 * ui-sdk API (including the markdown render pipeline). It is embedded into
 * the artifact by build.php as UI_SDK_JS and served here so both the admin
 * SPA and the sifront can load it via `<script type="module">` and share a
 * single instance instead of bundling duplicates.
 */
function serve_ui_sdk(): never
{
    header('Content-Type: application/javascript; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: public, max-age=31536000, immutable');

    echo UI_SDK_JS;
    exit;
}