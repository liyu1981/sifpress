/**
 * ------------------------------------------------------------
 * Migration endpoint
 *
 *   ?module=migration             GET  status
 *   ?module=migration&action=run  POST apply pending migrations + seeds
 *
 * Public and unauthenticated by design: a fresh install has no users yet,
 * and the runner is forward-only and idempotent. Applying is gated by
 * _migrations so already-applied versions are skipped.
 * ------------------------------------------------------------
 */

function handle_migration(string $action, string $method): never
{
    switch ($action) {
        case '':
        case 'status':
            $v = db_version();
            $applied = $v['applied'];

            json_response([
                'migrate_required' => $applied !== $v['latest'],
                'version' => $applied,
                'latest' => $v['latest'],
                'migrations' => array_map(
                    static fn (string $ver): array => [
                        'version' => $ver,
                        'applied' => in_array($ver, $applied, true),
                    ],
                    $v['latest']
                ),
            ]);

        case 'run':
            if ($method !== 'POST') {
                json_response(['error' => 'Method not allowed'], 405);
            }

            if (!db_needs_migration()) {
                json_response(['error' => 'already up to date'], 409);
            }

            $applied = db_migrate();
            seed_rbac();
            seed_default_admin();
            seed_favicon();

            json_response([
                'applied' => $applied,
                'latest' => array_keys(MIGRATIONS),
                'migrate_required' => false,
            ]);

        default:
            json_response(['error' => 'Unknown migration action'], 404);
    }
}
