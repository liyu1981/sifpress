/**
 * ------------------------------------------------------------
 * Dev-only module
 *
 *   ?module=dev&action=initData    POST  seed the demo article
 *   ?module=dev&resetAdminPasswd=  GET/POST reset the admin password
 *
 * This fragment is included ONLY in dev builds (php build.php).
 * rel.sh / "php build.php release" excludes it, and the router
 * region that dispatches module=dev is stripped at the same time,
 * so the release artifact contains no trace of the endpoint.
 *
 * resetAdminPasswd is unauthenticated by design (dev convenience for
 * a forgotten password) and upserts the canonical `admin` account: it
 * updates the existing row or creates one with the admin role.
 *
 * initData requires an authenticated admin and seeds (or refreshes)
 * the demo page that exercises every markdown feature the frontend
 * supports: headings, emphasis, links, image sizing/positioning and the
 * `|link` escape, video embeds (files/YouTube/Bilibili), GFM lists and
 * tables, KaTeX math, Mermaid diagrams, and code blocks. Each section
 * shows the syntax first, then its rendered result. The page is created
 * "in the name of" the calling admin.
 * ------------------------------------------------------------
 */

const DEMO_PAGE = [
    'slug' => DEMO_PAGE_SLUG,
    'title' => DEMO_PAGE_TITLE,
    'status' => 'published',
    'content_md' => DEMO_PAGE_CONTENT,
];

/**
 * Upsert the canonical `admin` account with the given password (hashed
 * with password_hash). Updates the existing row, or creates one with
 * the admin role when no `admin` user exists yet. Unauthenticated and
 * dev-only by construction (this fragment is stripped from releases).
 */
function reset_admin_password(string $password): void
{
    $pdo = db();
    $hash = password_hash($password, PASSWORD_DEFAULT);

    $stmt = $pdo->prepare('SELECT id FROM users WHERE username = ?');
    $stmt->execute(['admin']);
    $adminId = $stmt->fetchColumn();

    if ($adminId !== false) {
        $stmt = $pdo->prepare(
            'UPDATE users SET password_hash = ?, must_change_password = 0,
                    updated_at = datetime(\'now\') WHERE id = ?'
        );
        $stmt->execute([$hash, $adminId]);
        return;
    }

    $pdo->beginTransaction();

    try {
        $stmt = $pdo->prepare(
            'INSERT INTO users (username, name, password_hash, must_change_password)
             VALUES (?, ?, ?, 0)'
        );
        $stmt->execute(['admin', 'Administrator', $hash]);
        $userId = (int) $pdo->lastInsertId();

        $adminRoleId = $pdo->query("SELECT id FROM roles WHERE code = 'admin'")->fetchColumn();

        if ($adminRoleId !== false) {
            $pdo->prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)')
                ->execute([$userId, (int) $adminRoleId]);
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        throw $e;
    }
}

/**
 * Seed (or refresh) the demo page in the name of the authenticated
 * admin. Every hit overwrites the page in place (id, content, cover,
 * status, and authorship all reset), so the demo data is always an
 * exact copy of DEMO_PAGE. Works over GET or POST (dev convenience).
 */
function handle_dev(string $action, string $method): never
{
    /*
     * ?module=dev&resetAdminPasswd=<password> — unauthenticated reset
     * of the admin account. Intercepted before the action switch since
     * the password arrives as a top-level query parameter.
     */
    $resetPassword = request_param('resetAdminPasswd');

    if ($resetPassword !== null) {
        if (!in_array($method, ['GET', 'POST'], true)) {
            json_response(['error' => 'Method not allowed'], 405);
        }

        if (trim($resetPassword) === '') {
            json_response(['error' => 'password is required'], 422);
        }

        reset_admin_password($resetPassword);

        json_response(['ok' => true, 'username' => 'admin']);
    }

    switch ($action) {
        case 'initData':
            if (!in_array($method, ['GET', 'POST'], true)) {
                json_response(['error' => 'Method not allowed'], 405);
            }

            $user = require_auth();

            if (!is_admin($user)) {
                json_response(['error' => 'forbidden', 'permission' => 'admin'], 403);
            }

            $stmt = db()->prepare('SELECT id FROM pages WHERE slug = ?');
            $stmt->execute([DEMO_PAGE['slug']]);
            $existing = $stmt->fetchColumn();

            if ($existing === false) {
                $stmt = db()->prepare(
                    'INSERT INTO pages (slug, title, content_md, status, created_by, updated_by)
                     VALUES (?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([
                    DEMO_PAGE['slug'],
                    DEMO_PAGE['title'],
                    DEMO_PAGE['content_md'],
                    DEMO_PAGE['status'],
                    $user['id'],
                    $user['id'],
                ]);
                $id = (int) db()->lastInsertId();
            } else {
                $id = (int) $existing;
                $stmt = db()->prepare(
                    'UPDATE pages SET title = ?, content_md = ?, status = ?,
                            created_by = ?, updated_by = ?, updated_at = datetime(\'now\')
                      WHERE id = ?'
                );
                $stmt->execute([
                    DEMO_PAGE['title'],
                    DEMO_PAGE['content_md'],
                    DEMO_PAGE['status'],
                    $user['id'],
                    $user['id'],
                    $id,
                ]);
            }

            grant_default_guest_view($id, $user['id']);

            json_response(['page' => page_payload(fetch_page($id))]);

        default:
            json_response(['error' => 'Unknown dev action'], 404);
    }
}
