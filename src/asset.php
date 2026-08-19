/**
 * ------------------------------------------------------------
 * Assets
 *
 * Shared asset helpers (size caps, MIME whitelist, payload) and
 * the binary serving endpoint:
 *
 *   ?p=asset&id=N            GET original blob
 *   ?p=asset&id=N&thumb=1    GET thumbnail blob
 *
 * The JSON management API lives in api.php (assets.list / get /
 * create / update / delete); only blob streaming lives here.
 * ------------------------------------------------------------
 */

/* ------------------------------------------------------------------ */
/* Limits                                                             */
/* ------------------------------------------------------------------ */

const ASSET_MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const ASSET_MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const ASSET_THUMB_MAX_BYTES = 512 * 1024;
const ASSET_MAX_NAME_BYTES = 255;
const ASSET_MAX_AVATAR_BYTES = 1024 * 1024;

/**
 * SQLITE_MAX_LENGTH compile-time default (1 GiB). It is not queryable
 * through PDO, so it is a documented constant rather than a runtime
 * probe. The per-kind caps sit far below it; PHP's upload/post limits
 * are the binding constraint.
 */
const SQLITE_MAX_LENGTH = 1024 * 1024 * 1024;

/**
 * Parse a php.ini size value ('2M', '256M', '1G', '512K', '-1') into
 * bytes. '-1' (unlimited) and empty values map to PHP_INT_MAX so they
 * never become the minimum.
 */
function parse_ini_bytes(string $value): int
{
    $value = trim($value);

    if ($value === '' || $value === '-1') {
        return PHP_INT_MAX;
    }

    $unit = strtolower(substr($value, -1));
    $num = (int) $value;

    return match ($unit) {
        'g' => $num * 1024 * 1024 * 1024,
        'm' => $num * 1024 * 1024,
        'k' => $num * 1024,
        default => $num,
    };
}

/**
 * The PHP-side upload ceiling: the smaller of upload_max_filesize and
 * post_max_size, minus a 64 KiB allowance for multipart framing bytes.
 * Detected at runtime because php.ini differs between dev and prod, and
 * both directives are consumed by PHP before any app code runs.
 */
function asset_php_upload_limit(): int
{
    $upload = parse_ini_bytes((string) ini_get('upload_max_filesize'));
    $post = parse_ini_bytes((string) ini_get('post_max_size'));

    return max(0, min($upload, $post) - 65536);
}

/**
 * Effective per-kind cap: min(desired, php limit, sqlite limit).
 */
function asset_effective_cap(string $kind): int
{
    $desired = $kind === 'video' ? ASSET_MAX_VIDEO_BYTES : ASSET_MAX_IMAGE_BYTES;

    return min($desired, asset_php_upload_limit(), SQLITE_MAX_LENGTH);
}

/* ------------------------------------------------------------------ */
/* MIME whitelist                                                     */
/* ------------------------------------------------------------------ */

const ASSET_ALLOWED_MIME = [
    'image/jpeg' => 'image',
    'image/png' => 'image',
    'image/gif' => 'image',
    'image/webp' => 'image',
    'image/avif' => 'image',
    'video/mp4' => 'video',
    'video/webm' => 'video',
    'video/ogg' => 'video',
];

/**
 * The asset kind for a MIME type, or null when the type is not allowed.
 * SVG is deliberately absent: served inline on the same origin it is an
 * XSS vector.
 */
function asset_kind_for_mime(string $mime): ?string
{
    return ASSET_ALLOWED_MIME[$mime] ?? null;
}

/* ------------------------------------------------------------------ */
/* Meta payload                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetch an asset row joined with the uploader's display name, or null.
 */
function fetch_asset_meta(int $id): ?array
{
    $stmt = db()->prepare(
        'SELECT a.*, u.name AS uploaded_by_name
           FROM assets a
           LEFT JOIN users u ON u.id = a.uploaded_by
          WHERE a.id = ?'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    return $row === false ? null : $row;
}

/**
 * Public asset metadata; never includes the blobs.
 */
function asset_payload(array $row): array
{
    $id = (int) $row['id'];

    return [
        'id' => $id,
        'name' => (string) $row['name'],
        'mime' => (string) $row['mime'],
        'kind' => (string) $row['kind'],
        'size_bytes' => (int) $row['size_bytes'],
        'width' => $row['width'] !== null ? (int) $row['width'] : null,
        'height' => $row['height'] !== null ? (int) $row['height'] : null,
        'duration' => $row['duration'] !== null ? (float) $row['duration'] : null,
        'md5' => $row['md5'] !== null ? (string) $row['md5'] : null,
        'has_thumb' => $row['thumb'] !== null,
        'is_public' => (bool) (int) $row['is_public'],
        'uploaded_by' => $row['uploaded_by'] !== null ? (int) $row['uploaded_by'] : null,
        'uploaded_by_name' => (string) $row['uploaded_by_name'],
        'created_at' => (string) $row['created_at'],
        'url' => '?p=asset&id=' . $id,
        'thumb_url' => '?p=asset&id=' . $id . '&thumb=1',
    ];
}

/* ------------------------------------------------------------------ */
/* Avatars                                                            */
/* ------------------------------------------------------------------ */

/**
 * Deterministic generated avatar: a circular SVG with the first letter of
 * the display name (falling back to the email) on a hue derived from the
 * email. Pure text with the initial html-escaped, so it is safe to serve
 * inline and requires zero PHP image footprint (no GD/Imagick).
 */
function user_avatar_svg(string $name, string $email): string
{
    $seed = strtolower(trim($email !== '' ? $email : $name));
    $hue = ((crc32($seed) % 360) + 360) % 360;
    $bg = sprintf('hsl(%d 62%% 45%%)', $hue);

    $initial = $name !== '' ? mb_substr(trim($name), 0, 1) : '';

    if ($initial === '' && $email !== '') {
        $initial = mb_substr(trim($email), 0, 1);
    }

    if ($initial === '') {
        $initial = '?';
    }

    return '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">'
        . '<rect width="128" height="128" rx="64" fill="' . $bg . '"/>'
        . '<text x="64" y="64" font-family="-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="56" fill="#ffffff" text-anchor="middle" dominant-baseline="central">'
        . htmlspecialchars(mb_strtoupper($initial), ENT_XML1 | ENT_QUOTES, 'UTF-8')
        . '</text></svg>';
}

/**
 * Data URI for the generated avatar, embedded directly in user payloads
 * so clients never need an extra request when no avatar is stored.
 */
function generated_avatar_data_uri(string $name, string $email): string
{
    return 'data:image/svg+xml;base64,' . base64_encode(user_avatar_svg($name, $email));
}

/**
 * Stream a user's avatar: the stored image blob when one exists, otherwise
 * the generated SVG. Public (avatars appear in articles) and immutable per
 * user, so it is cacheable.
 */
function serve_user_avatar(int $userId): never
{
    $stmt = db()->prepare(
        'SELECT name, email, avatar, avatar_mime FROM users WHERE id = ? AND is_active = 1'
    );
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    if ($row === false) {
        json_response(['error' => 'user not found'], 404);
    }

    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');

    if ($row['avatar'] !== null) {
        $mime = $row['avatar_mime'] !== '' && $row['avatar_mime'] !== null
            ? (string) $row['avatar_mime']
            : 'image/png';

        header('Content-Type: ' . $mime);
        header('Content-Length: ' . strlen($row['avatar']));
        echo $row['avatar'];
        exit;
    }

    header('Content-Type: image/svg+xml');
    echo user_avatar_svg((string) $row['name'], (string) $row['email']);
    exit;
}

/* ------------------------------------------------------------------ */
/* Serving                                                            */
/* ------------------------------------------------------------------ */

/**
 * Parse a single-range `Range: bytes=...` header against a resource size.
 * Supports open-ended (`bytes=N-`) and suffix (`bytes=-N`) ranges. Returns
 * [start, end] inclusive, null when the header is missing/malformed, or the
 * string 'invalid' for an unsatisfiable range.
 *
 * @return array{0:int,1:int}|string|null
 */
function parse_byte_range(string $header, int $size)
{
    if (!preg_match('/^bytes=(\d*)-(\d*)$/', trim($header), $m)) {
        return null;
    }

    $startSpec = $m[1];
    $endSpec = $m[2];

    if ($startSpec === '' && $endSpec === '') {
        return null;
    }

    if ($startSpec === '') {
        $len = min((int) $endSpec, $size);
        $start = $size - $len;
        $end = $size - 1;
    } else {
        $start = (int) $startSpec;
        if ($start >= $size) {
            return 'invalid';
        }
        $end = $endSpec === '' ? $size - 1 : min((int) $endSpec, $size - 1);
    }

    if ($start > $end) {
        return null;
    }

    return [$start, $end];
}

function handle_asset(string $method): never
{
    if ($method !== 'GET') {
        json_response(['error' => 'Method not allowed'], 405);
    }

    if (db_needs_migration()) {
        json_response(['error' => 'migration_required'], 503);
    }

    $userId = request_param('user');

    if ($userId !== null) {
        serve_user_avatar((int) $userId);
    }

    $id = (int) request_param('id', '0');

    if ($id <= 0) {
        json_response(['error' => 'asset not found'], 404);
    }

    $stmt = db()->prepare(
        'SELECT id, name, mime, size_bytes, length(data) AS data_length, thumb_mime, is_public, uploaded_by
           FROM assets WHERE id = ?'
    );
    $stmt->execute([$id]);
    $row = $stmt->fetch();

    if ($row === false) {
        json_response(['error' => 'asset not found'], 404);
    }

    if (!(bool) (int) $row['is_public']) {
        require_auth();
    }

    $thumb = request_param('thumb') === '1';

    if (!$thumb && (int) $row['size_bytes'] !== (int) $row['data_length']) {
        json_response([
            'error' => 'asset data size mismatch',
            'asset_id' => $id,
            'expected_bytes' => (int) $row['size_bytes'],
            'actual_bytes' => (int) $row['data_length'],
        ], 500);
    }

    if ($thumb) {
        /*
         * Thumbnails are tiny (<= 512 KiB) by construction, so loading
         * the blob into memory is cheap and gives us Content-Length.
         */
        $stmt = db()->prepare('SELECT thumb, thumb_mime FROM assets WHERE id = ?');
        $stmt->execute([$id]);
        $blob = $stmt->fetch();

        if ($blob === false || $blob['thumb'] === null) {
            json_response(['error' => 'no thumbnail'], 404);
        }

        $mime = (string) $blob['thumb_mime'];
        $data = $blob['thumb'];
        $etag = '"asset-' . $id . '-thumb"';
        $len = strlen($data);
    } else {
        /*
         * Originals can be up to hundreds of MB; stream the blob through
         * php://output instead of buffering it in memory. Length and the
         * ETag come from the meta row (blobs are immutable once stored).
         */
        $mime = (string) $row['mime'];
        $len = (int) $row['size_bytes'];
        $etag = '"asset-' . $id . '"';
    }

    if (($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $etag) {
        http_response_code(304);
        header('ETag: ' . $etag);
        exit;
    }

    header('Content-Type: ' . $mime);
    header('Cache-Control: private, max-age=3600');
    header('ETag: ' . $etag);
    header('X-Content-Type-Options: nosniff');
    header('Content-Disposition: inline; filename="' . basename((string) $row['name']) . '"');

    if ($thumb) {
        header('Content-Length: ' . $len);
        echo $data;
        exit;
    }

    /*
     * Range support is required for <video>/<audio> playback. When a server
     * answers a Range request with a 200 instead of a 206, media elements
     * can re-request the stream in a loop (high CPU, endless reloads).
     */
    header('Accept-Ranges: bytes');

    $rawRange = $_SERVER['HTTP_RANGE'] ?? '';
    $range = $rawRange !== '' ? parse_byte_range($rawRange, $len) : null;

    if ($range === 'invalid') {
        http_response_code(416);
        header('Content-Range: bytes */' . $len);
        exit;
    }

    if ($range !== null) {
        [$start, $end] = $range;
        http_response_code(206);
        header('Content-Range: bytes ' . $start . '-' . $end . '/' . $len);
        header('Content-Length: ' . ($end - $start + 1));

        // substr() on the blob is 1-based and byte-accurate, and cheap for
        // the byte ranges media players actually request.
        $rangeStmt = db()->prepare('SELECT substr(data, ?, ?) FROM assets WHERE id = ?');
        $rangeStmt->execute([$start + 1, $end - $start + 1, $id]);
        $part = $rangeStmt->fetchColumn();
        echo $part === false ? '' : $part;
        exit;
    }

    header('Content-Length: ' . $len);

    $stmt = db()->prepare('SELECT data FROM assets WHERE id = ?');
    $stmt->bindColumn(1, $stream, PDO::PARAM_LOB);
    $stmt->execute([$id]);
    $stmt->fetch(PDO::FETCH_BOUND);

    if (is_resource($stream)) {
        rewind($stream);
        fpassthru($stream);
    } elseif (is_string($stream)) {
        echo $stream;
    }

    exit;
}
