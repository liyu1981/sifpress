/**
 * ------------------------------------------------------------
 * Asset storage
 *
 * Bytes live behind an `AssetStorage` interface, not in the database. The
 * filesystem implementation writes one file per object under a content
 * directory outside the docroot, addressed by an opaque uuid key; a future
 * object-storage implementation only has to satisfy the same six methods.
 *
 * The `assets` row keeps owning identity (name, mime, size, md5) and access
 * control (is_public + asset_grants), so `?p=asset&id=N` URLs, ETags and
 * permissions are unchanged by the backend.
 * ------------------------------------------------------------
 */

/** One stored object: an opaque key plus the facts the row records about it. */
final class AssetObject
{
    public function __construct(
        public readonly string $key,
        public readonly int $sizeBytes,
        public readonly string $etag,
        public readonly string $mime,
    ) {
    }
}

interface AssetStorage
{
    /** Backend id persisted on the row ('fs', 's3', ...). */
    public function id(): string;

    /**
     * Store the file at $sourcePath under a fresh key and return its
     * description. Never overwrites an existing key, and never buffers the
     * file in memory. Throws on failure.
     */
    public function put(string $sourcePath, string $mime): AssetObject;

    /** Read handle positioned at $offset, or false when the key is gone. */
    public function open(string $key, int $offset = 0): mixed;

    /** Byte size of the stored object, or null when it does not exist. */
    public function size(string $key): ?int;

    public function exists(string $key): bool;

    /** Remove one object. A missing key is not an error. */
    public function delete(string $key): void;

    /**
     * Real filesystem path for the key, when the backend has one. This is the
     * hook for handing playback to the web server (X-Accel-Redirect /
     * X-Sendfile); object storage returns null and the caller streams from
     * open() instead.
     */
    public function localPath(string $key): ?string;
}

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

/**
 * File extension per stored MIME. Derived from the *sniffed* type only — a
 * client-supplied filename never reaches this table, so a hostile name cannot
 * pick its extension. Anything outside the map falls back to `bin`.
 */
const ASSET_EXT_FOR_MIME = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/gif' => 'gif',
    'image/webp' => 'webp',
    'image/avif' => 'avif',
    'video/mp4' => 'mp4',
    'video/webm' => 'webm',
    'video/ogg' => 'ogv',
];

function asset_ext_for_mime(string $mime): string
{
    return ASSET_EXT_FOR_MIME[$mime] ?? 'bin';
}

/**
 * A key is `ab/cd/<uuid>.<ext>`: two fan-out levels from the uuid hex keep
 * directories small without needing time-ordered ids, and the name carries no
 * user input. Anything else is rejected before it can touch the filesystem.
 */
function asset_key_is_valid(string $key): bool
{
    return (bool) preg_match(
        '/^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/',
        $key
    );
}

function asset_uuid_v4(): string
{
    $bytes = random_bytes(16);

    /* Set the version (4) and variant (RFC 4122) bits, then format. */
    $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
    $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
    $hex = bin2hex($bytes);

    return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-'
        . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
}

/** Content key for a fresh object of $mime, derived from $uuid. */
function asset_key_for(string $uuid, string $mime): string
{
    $uuid = strtolower($uuid);

    return substr($uuid, 0, 2) . '/' . substr($uuid, 2, 2) . '/' . $uuid . '.' . asset_ext_for_mime($mime);
}

/* ------------------------------------------------------------------ */
/* Filesystem backend                                                 */
/* ------------------------------------------------------------------ */

/**
 * One file per object under `<dir>/ab/cd/uuid.ext`, written via a temp file
 * plus rename() so a reader never sees a half-written object, and swept for
 * orphans on every put().
 */
final class FsAssetStorage implements AssetStorage
{
    /** Chunk size for hashing/copying; keeps memory flat for huge videos. */
    private const CHUNK = 1048576;

    /** Temp files older than this are considered abandoned. */
    private const TMP_TTL = 3600;

    public function __construct(private readonly string $dir)
    {
    }

    public function id(): string
    {
        return 'fs';
    }

    /** Absolute path for a key, or null when the key is not well formed. */
    public function localPath(string $key): ?string
    {
        if (!asset_key_is_valid($key)) {
            return null;
        }

        return $this->dir . '/' . $key;
    }

    public function put(string $sourcePath, string $mime): AssetObject
    {
        $key = asset_key_for(asset_uuid_v4(), $mime);
        $target = (string) $this->localPath($key);

        if ($target === '') {
            throw new RuntimeException('Refusing to store an asset under an invalid key.');
        }

        $dir = dirname($target);

        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException("Cannot create asset directory: {$dir}");
        }

        $tmpDir = $this->dir . '/.tmp';

        if (!is_dir($tmpDir) && !@mkdir($tmpDir, 0775, true) && !is_dir($tmpDir)) {
            throw new RuntimeException("Cannot create asset temp directory: {$tmpDir}");
        }

        $this->sweepTmp($tmpDir);

        $tmp = $tmpDir . '/' . basename($target) . '.' . bin2hex(random_bytes(4)) . '.incoming';

        if (!@copy($sourcePath, $tmp)) {
            @unlink($tmp);

            throw new RuntimeException('Cannot stage asset file.');
        }

        @chmod($tmp, 0644);

        /*
         * rename() is atomic within a filesystem, so a concurrent reader sees
         * either nothing or the complete file.
         */
        if (!@rename($tmp, $target)) {
            @unlink($tmp);

            throw new RuntimeException("Cannot move asset into place: {$target}");
        }

        clearstatcache(true, $target);

        return new AssetObject($key, (int) @filesize($target), (string) md5_file($target), $mime);
    }

    public function open(string $key, int $offset = 0): mixed
    {
        $path = $this->localPath($key);

        if ($path === null || !is_file($path)) {
            return false;
        }

        $handle = @fopen($path, 'rb');

        if ($handle === false) {
            return false;
        }

        if ($offset > 0 && fseek($handle, $offset) !== 0) {
            fclose($handle);

            return false;
        }

        return $handle;
    }

    public function size(string $key): ?int
    {
        $path = $this->localPath($key);

        if ($path === null || !is_file($path)) {
            return null;
        }

        clearstatcache(true, $path);

        return (int) @filesize($path);
    }

    public function exists(string $key): bool
    {
        $path = $this->localPath($key);

        return $path !== null && is_file($path);
    }

    public function delete(string $key): void
    {
        $path = $this->localPath($key);

        if ($path !== null && is_file($path)) {
            @unlink($path);
        }
    }

    /**
     * Hash a file in chunks. Used by the upload path and the migration tool;
     * md5_file() would work too but this keeps one implementation of "read a
     * big file without memory".
     */
    public function hash(string $key): ?string
    {
        $path = $this->localPath($key);

        if ($path === null || !is_file($path)) {
            return null;
        }

        $handle = @fopen($path, 'rb');

        if ($handle === false) {
            return null;
        }

        $ctx = hash_init('md5');

        while (!feof($handle)) {
            $chunk = fread($handle, self::CHUNK);

            if ($chunk === false) {
                break;
            }

            hash_update($ctx, $chunk);
        }

        fclose($handle);

        return hash_final($ctx);
    }

    /** Drop abandoned temp files from an interrupted put(). */
    private function sweepTmp(string $tmpDir): void
    {
        $cutoff = time() - self::TMP_TTL;

        foreach (glob($tmpDir . '/*.incoming') ?: [] as $path) {
            if (is_file($path) && (int) @filemtime($path) < $cutoff) {
                @unlink($path);
            }
        }
    }
}

/**
 * Staging area for in-progress chunked uploads, inside the asset directory so
 * parts land on the same filesystem as the final object (the rename in put()
 * stays atomic).
 */
function asset_staging_dir(): string
{
    return asset_dir() . '/staging';
}

function asset_staging_dir_ready(): string
{
    $dir = asset_staging_dir();

    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create upload staging directory: {$dir}");
    }

    return $dir;
}

/** A staging path is `<staging>/<uuid>.part` — validated, never user input. */
function asset_staging_path(string $token): ?string
{
    if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/', strtolower($token)) !== 1) {
        return null;
    }

    return asset_staging_dir() . '/' . strtolower($token) . '.part';
}

/**
 * Part size handed to the client: a chunk is a raw request body, so
 * `post_max_size` truncates it exactly like a whole file would. Keep clear of
 * that limit (and of a floor that makes big files needlessly chatty).
 */
function asset_upload_part_size(): int
{
    $limit = asset_php_upload_limit();

    if ($limit <= 0) {
        return 4 * 1024 * 1024;
    }

    /* Half the limit, snapped to 256 KiB, so a chunk is comfortably accepted. */
    $size = intdiv(max($limit, 2 * 1024 * 1024), 2);
    $size = intdiv($size, 262144) * 262144;

    return max($size, 512 * 1024);
}

/** How long an unfinished upload is kept before it is swept. */
function asset_upload_ttl(): int
{
    return 24 * 3600;
}

/**
 * Delete expired uploads (row + staging file). $limit bounds the sweep so it is
 * safe to call on every create.
 *
 * @return int number of uploads removed
 */
function asset_upload_purge_expired(int $limit = 20): int
{
    $rows = db()->query(
        'SELECT token FROM asset_uploads WHERE expires_at < datetime(\'now\') LIMIT ' . max(1, $limit)
    )->fetchAll();

    if ($rows === []) {
        return 0;
    }

    $ids = [];

    foreach ($rows as $row) {
        $path = asset_staging_path((string) $row['token']);

        if ($path !== null && is_file($path)) {
            @unlink($path);
        }

        $ids[] = (string) $row['token'];
    }

    $placeholders = implode(',', array_fill(0, count($ids), '?'));

    db()->prepare('DELETE FROM asset_uploads WHERE token IN (' . $placeholders . ')')->execute($ids);

    return count($ids);
}

/* ------------------------------------------------------------------ */
/* Wiring                                                             */
/* ------------------------------------------------------------------ */

/**
 * Folder holding asset bytes. Precedence mirrors db_dir():
 *
 *   1. SIFPRESS_ASSET_DIR constant (from sifpress_config.php)
 *   2. SIFPRESS_ASSET_DIR environment variable
 *   3. <db_dir>/assets  (outside the docroot by default)
 *
 * It must stay outside DOCUMENT_ROOT: assets are served through ?p=asset,
 * which enforces is_public and the per-asset grants. A directory the web
 * server can reach directly would serve every asset to anyone.
 */
function asset_dir(): string
{
    $dir = '';

    if (defined('SIFPRESS_ASSET_DIR')) {
        $dir = trim((string) SIFPRESS_ASSET_DIR);
    }

    if ($dir === '') {
        $dir = trim((string) (getenv('SIFPRESS_ASSET_DIR') ?: ''));
    }

    if ($dir === '') {
        $dir = db_dir() . '/assets';
    }

    return rtrim($dir, '/\\');
}

/**
 * The asset directory, created on demand, with a hard refusal when it resolves
 * inside the document root (see asset_dir()).
 */
function asset_dir_ready(): string
{
    $dir = asset_dir();
    $webRoot = rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/\\');

    if ($webRoot !== '' && str_starts_with($dir . '/', $webRoot . '/')) {
        throw new RuntimeException(
            'The asset directory must be outside DOCUMENT_ROOT ('
            . $dir . ' is inside ' . $webRoot . '). Set SIFPRESS_ASSET_DIR to a folder '
            . 'the web server cannot serve directly.'
        );
    }

    if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
        throw new RuntimeException("Cannot create asset directory: {$dir}");
    }

    if (!is_writable($dir)) {
        throw new RuntimeException("Asset directory is not writable: {$dir}");
    }

    return $dir;
}

/**
 * Backend selected by config. 'fs' is the only one today; the switch exists
 * so an object-storage backend can land without touching any caller.
 */
function asset_storage(): AssetStorage
{
    static $storage = null;

    if ($storage === null) {
        $backend = defined('SIFPRESS_ASSET_BACKEND') ? trim((string) SIFPRESS_ASSET_BACKEND) : 'fs';

        if ($backend !== 'fs') {
            throw new RuntimeException("Unknown asset storage backend: {$backend}");
        }

        $storage = new FsAssetStorage(asset_dir_ready());
    }

    return $storage;
}

/**
 * Store an uploaded temp file, returning the row values for a stored asset
 * (storage id, key, etag, size). Shared by assets.create and the CLI
 * migration so both produce identical rows.
 *
 * @return array{0:string,1:string,2:string,3:int} storage, key, etag, size
 */
function asset_store_file(string $sourcePath, string $mime): array
{
    $storage = asset_storage();
    $object = $storage->put($sourcePath, $mime);

    return [$storage->id(), $object->key, $object->etag, $object->sizeBytes];
}