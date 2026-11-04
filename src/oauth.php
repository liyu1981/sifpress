/**
 * ------------------------------------------------------------
 * Social sign-in (OAuth 2.0 / OpenID Connect)
 *
 * A browser-redirect dance, not a JSON API: `?p=sifpress/oauth` is a
 * server-side endpoint pair
 *
 *   action=start     -> 302 to the provider's authorization page
 *   action=callback  -> 302 back into the admin SPA (session cookie set)
 *
 * so the client secret never reaches the browser and nothing about the
 * exchange is done in JavaScript.
 *
 * Two modes, chosen by the `mode` parameter on start:
 *
 *   login  - sign in. An existing (provider, subject) link wins; otherwise
 *            the provider's verified email is compared against the local
 *            accounts (users.email), and the only allowed outcome is a
 *            sign-in of that existing account. There is no self-service
 *            sign-up: accounts stay admin-managed.
 *   bind   - link the provider account to the *currently signed-in* local
 *            account. The social email must equal the account email (an
 *            account without an email adopts the social one), and an
 *            identity already linked elsewhere is refused.
 *
 * Guarantees:
 *
 *   state    a single-use random value, stored hashed, matched against an
 *            HttpOnly cookie so a callback URL cannot be replayed into
 *            someone else's browser (login CSRF).
 *   PKCE     S256 challenge/verifier, so a leaked authorization code is
 *            useless without the row above.
 *   email    must be present and verified before anything is compared.
 *
 * Configuration lives in sifpress_config.php, never in the database: the
 * client credentials are server infrastructure (like SIFPRESS_DB_DIR), not
 * content an application admin should be able to read or change from the
 * browser. A provider is *enabled* exactly when its client id and secret are
 * both defined and non-empty; there is no separate on/off row.
 * ------------------------------------------------------------
 */

/** How long an in-flight authorization request stays valid. */
if (!defined('OAUTH_STATE_TTL')) {
    define('OAUTH_STATE_TTL', 600);
}

/** Timeout (seconds) for the token and userinfo calls. */
if (!defined('OAUTH_HTTP_TIMEOUT')) {
    define('OAUTH_HTTP_TIMEOUT', 10);
}

/**
 * Supported providers, keyed by the id used in the config constants
 * (`SIFPRESS_<ID>_CLIENT_ID`, `SIFPRESS_<ID>_CLIENT_SECRET`,
 * `SIFPRESS_<ID>_REDIRECT_URI`) and in API payloads.
 *
 * @return array<string, array{name:string, authorize:string, token:string, userinfo:string, scope:string}>
 */
function oauth_providers(): array
{
    return [
        'google' => [
            'name' => 'Google',
            'authorize' => 'https://accounts.google.com/o/oauth2/v2/auth',
            'token' => 'https://oauth2.googleapis.com/token',
            'userinfo' => 'https://openidconnect.googleapis.com/v1/userinfo',
            'scope' => 'openid email profile',
        ],
    ];
}

/**
 * One provider definition, or null for an unknown id.
 *
 * @return array{name:string, authorize:string, token:string, userinfo:string, scope:string}|null
 */
function oauth_provider(string $provider): ?array
{
    return oauth_providers()[$provider] ?? null;
}

/**
 * A provider's config value (`SIFPRESS_GOOGLE_CLIENT_ID`, …), or '' when the
 * operator has not defined it. Reading through constant() keeps the config
 * file the single source of truth, and lets an install that predates the
 * constants keep working: undefined simply means "not configured".
 */
function oauth_provider_config(string $provider, string $suffix): string
{
    $name = 'SIFPRESS_' . strtoupper($provider) . '_' . strtoupper($suffix);

    if (!defined($name)) {
        return '';
    }

    $value = constant($name);

    return is_string($value) ? trim($value) : '';
}

/**
 * Whether the provider can be used: both halves of the OAuth client are in
 * sifpress_config.php. This *is* the on/off switch — deleting or blanking the
 * constants removes the login button.
 */
function oauth_provider_enabled(string $provider): bool
{
    if (oauth_provider($provider) === null) {
        return false;
    }

    return oauth_provider_config($provider, 'client_id') !== ''
        && oauth_provider_config($provider, 'client_secret') !== '';
}

/**
 * Whether a verified provider email is allowed to link itself to the local
 * account with the same address (SIFPRESS_SOCIAL_AUTO_LINK, default true).
 * With it off, users must connect the account from My Account.
 */
function oauth_auto_link(): bool
{
    if (!defined('SIFPRESS_SOCIAL_AUTO_LINK')) {
        return true;
    }

    $value = SIFPRESS_SOCIAL_AUTO_LINK;

    if (is_string($value)) {
        $value = !in_array(strtolower(trim($value)), ['', '0', 'false', 'off', 'no'], true);
    }

    return (bool) $value;
}

/**
 * Providers offered to the current (anonymous) visitor: enabled ones only.
 * The login page renders one button per entry.
 *
 * @return list<array{id:string, name:string}>
 */
function oauth_enabled_providers(): array
{
    $providers = [];

    foreach (oauth_providers() as $id => $definition) {
        if (oauth_provider_enabled($id)) {
            $providers[] = ['id' => $id, 'name' => $definition['name']];
        }
    }

    return $providers;
}

/**
 * Where the provider sends the browser back to. Must be registered verbatim
 * in the provider console, so an operator can pin it with
 * `SIFPRESS_<ID>_REDIRECT_URI` — otherwise it follows the artifact's URL mode
 * (see src/urlmode.php) and moves if pretty URLs are switched on.
 */
function oauth_redirect_uri(string $provider): string
{
    $override = oauth_provider_config($provider, 'redirect_uri');

    if ($override !== '') {
        return $override;
    }

    return oauth_redirect_uri_default($provider);
}

/** The callback URL the artifact derives from the current URL mode. */
function oauth_redirect_uri_default(string $provider): string
{
    return route_url('sifpress/oauth', ['action' => 'callback', 'provider' => $provider]);
}

/** The sifpress_config.php file the running artifact loaded (or its name). */
function oauth_config_file(): string
{
    $path = (string) ($GLOBALS['sifpress_config_path'] ?? '');

    return $path === '' ? 'sifpress_config.php' : basename($path);
}

/**
 * A ready-to-paste block of config constants for the admin UI. Generated here
 * (not in the browser) so the redirect URI in the comment is always the one
 * this deployment actually uses.
 */
function oauth_config_snippet(string $configFile): string
{
    $lines = ['// Social sign-in. Leave a client id empty to keep the provider disabled.'];

    foreach (oauth_providers() as $id => $definition) {
        $prefix = 'SIFPRESS_' . strtoupper($id);

        $lines[] = '';
        $lines[] = "define('{$prefix}_CLIENT_ID', '');";
        $lines[] = "define('{$prefix}_CLIENT_SECRET', '');";
        $lines[] = '// Optional: pin the callback URL (register it with ' . $definition['name'] . ').';
        $lines[] = '// Empty = derived from the request: ' . oauth_redirect_uri_default($id);
        $lines[] = "define('{$prefix}_REDIRECT_URI', '');";
    }

    $lines[] = '';
    $lines[] = '// Link a social account to the local account with the same email on sign-in.';
    $lines[] = "define('SIFPRESS_SOCIAL_AUTO_LINK', true);";

    return "// " . $configFile . "\n" . implode("\n", $lines) . "\n";
}

/**
 * Read-only configuration view for the admin UI: what is configured, the
 * effective callback URL, and the snippet to paste. The client secret is
 * never part of the payload — only whether one is set.
 *
 * @return array<string, mixed>
 */
function social_settings_payload(): array
{
    $providers = [];

    foreach (oauth_providers() as $id => $definition) {
        $providers[] = [
            'id' => $id,
            'name' => $definition['name'],
            'enabled' => oauth_provider_enabled($id),
            'client_id' => oauth_provider_config($id, 'client_id'),
            'has_secret' => oauth_provider_config($id, 'client_secret') !== '',
            'redirect_uri' => oauth_redirect_uri($id),
            'redirect_uri_default' => oauth_redirect_uri_default($id),
        ];
    }

    $configFile = oauth_config_file();

    return [
        'providers' => $providers,
        'auto_link' => oauth_auto_link(),
        'config_file' => $configFile,
        'config_snippet' => oauth_config_snippet($configFile),
    ];
}

/**
 * A `next` value is an internal SPA path (`/admin/sifront`), never a URL:
 * anything with a scheme, a protocol-relative prefix or a parent segment
 * falls back to the caller's default. This keeps the endpoint from becoming
 * an open redirect.
 */
function oauth_normalize_next(?string $next, string $fallback): string
{
    $next = trim((string) $next);

    if ($next === '' || $next === '/admin/login') {
        return $fallback;
    }

    if ($next[0] !== '/' || str_starts_with($next, '//') || str_contains($next, '..')) {
        return $fallback;
    }

    if (preg_match('#^/[A-Za-z0-9._~/-]{0,200}$#', $next) !== 1) {
        return $fallback;
    }

    return $next;
}

/** URL-safe base64, as PKCE requires. */
function oauth_base64url(string $raw): string
{
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function oauth_state_cookie_set(string $state): void
{
    setcookie('oauth_state', $state, [
        'expires' => time() + OAUTH_STATE_TTL,
        'path' => cookie_path(),
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https(),
    ]);
}

function oauth_state_cookie_clear(): void
{
    setcookie('oauth_state', '', [
        'expires' => time() - 3600,
        'path' => cookie_path(),
        'httponly' => true,
        'samesite' => 'Lax',
        'secure' => is_https(),
    ]);
}

function oauth_redirect(string $location): never
{
    header('Location: ' . $location, true, 302);
    header('Cache-Control: no-store');
    exit;
}

/**
 * Send the browser back to the admin SPA with a status flag it can render.
 * `$target` is 'login' for failed sign-ins or 'account' for failed links.
 */
function oauth_fail(string $code, string $target = 'login'): never
{
    $route = $target === 'account' ? 'sifpress/admin/account' : 'sifpress/admin/login';

    oauth_redirect(route_url($route, ['social_error' => $code]));
}

/**
 * Small HTTP client for the token/userinfo calls: curl when the extension is
 * present (it usually is), stream wrappers otherwise — the same two-path
 * approach web_fetch_markdown() uses.
 *
 * @param list<string> $headers
 *
 * @return array{status:int, body:string, error:string}
 */
function oauth_http(string $method, string $url, array $headers, ?string $body): array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        $options = [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => OAUTH_HTTP_TIMEOUT,
            CURLOPT_CONNECTTIMEOUT => OAUTH_HTTP_TIMEOUT,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
        ];

        if ($body !== null) {
            $options[CURLOPT_POSTFIELDS] = $body;
        }

        curl_setopt_array($ch, $options);
        $result = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $error = (string) curl_error($ch);
        curl_close($ch);

        if ($result === false) {
            return ['status' => 0, 'body' => '', 'error' => $error !== '' ? $error : 'request failed'];
        }

        return ['status' => $status, 'body' => (string) $result, 'error' => ''];
    }

    if (!ini_get('allow_url_fopen')) {
        return ['status' => 0, 'body' => '', 'error' => 'no HTTP transport available'];
    }

    $context = stream_context_create([
        'http' => [
            'method' => $method,
            'timeout' => OAUTH_HTTP_TIMEOUT,
            'follow_location' => 0,
            'ignore_errors' => true,
            'header' => implode("\r\n", $headers),
            ...($body !== null ? ['content' => $body] : []),
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);

    $result = @file_get_contents($url, false, $context);

    if ($result === false) {
        return ['status' => 0, 'body' => '', 'error' => 'request failed'];
    }

    $status = 0;

    foreach ($http_response_header ?? [] as $header) {
        if (preg_match('#^HTTP/\S+\s+(\d{3})#', $header, $match) === 1) {
            $status = (int) $match[1];
        }
    }

    return ['status' => $status, 'body' => (string) $result, 'error' => ''];
}

/**
 * Trade the authorization code for an access token. Returns null on any
 * failure; the caller answers with a generic `exchange_failed` so provider
 * error details are never reflected into the browser.
 */
function oauth_exchange_code(string $provider, string $code, string $verifier): ?string
{
    $definition = oauth_provider($provider);

    if ($definition === null) {
        return null;
    }

    $body = http_build_query([
        'code' => $code,
        'client_id' => oauth_provider_config($provider, 'client_id'),
        'client_secret' => oauth_provider_config($provider, 'client_secret'),
        'redirect_uri' => oauth_redirect_uri($provider),
        'grant_type' => 'authorization_code',
        'code_verifier' => $verifier,
    ]);

    $response = oauth_http(
        'POST',
        $definition['token'],
        ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'],
        $body
    );

    if ($response['status'] < 200 || $response['status'] >= 300) {
        return null;
    }

    $data = json_decode($response['body'], true);

    if (!is_array($data) || !isset($data['access_token']) || !is_string($data['access_token'])) {
        return null;
    }

    return $data['access_token'];
}

/**
 * Read the provider profile over TLS with the access token we just obtained.
 * The token came straight from the token endpoint, so an extra JWT signature
 * check would only re-verify what the TLS channel already guarantees.
 *
 * @return array{subject:string, email:string, email_verified:bool, name:string}|null
 */
function oauth_fetch_profile(string $provider, string $accessToken): ?array
{
    $definition = oauth_provider($provider);

    if ($definition === null) {
        return null;
    }

    $response = oauth_http(
        'GET',
        $definition['userinfo'],
        ['Authorization: Bearer ' . $accessToken, 'Accept: application/json'],
        null
    );

    if ($response['status'] < 200 || $response['status'] >= 300) {
        return null;
    }

    $data = json_decode($response['body'], true);

    if (!is_array($data)) {
        return null;
    }

    /* Google's OIDC userinfo uses email_verified; the legacy v3 endpoint
     * spells the same claim verified_email. */
    $verified = $data['email_verified'] ?? $data['verified_email'] ?? false;
    $email = trim((string) ($data['email'] ?? ''));

    if ($email !== '' && filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
        $email = '';
    }

    return [
        'subject' => (string) ($data['sub'] ?? $data['id'] ?? ''),
        'email' => $email,
        'email_verified' => $verified === true || $verified === 1 || $verified === '1',
        'name' => trim((string) ($data['name'] ?? '')),
    ];
}

/** @return array{user_id:int, email:string}|null */
function oauth_identity_row(string $provider, string $subject): ?array
{
    $stmt = db()->prepare(
        'SELECT user_id, email FROM user_identities WHERE provider = ? AND subject = ?'
    );
    $stmt->execute([$provider, $subject]);
    $row = $stmt->fetch();

    if ($row === false) {
        return null;
    }

    return ['user_id' => (int) $row['user_id'], 'email' => (string) $row['email']];
}

/** Record that a link was used, and refresh the displayed email. */
function oauth_identity_touch(string $provider, string $subject, string $email): void
{
    db()->prepare(
        "UPDATE user_identities
            SET last_used_at = datetime('now'), email = ?
          WHERE provider = ? AND subject = ?"
    )->execute([$email, $provider, $subject]);
}

/** Active, non-guest account? */
function oauth_user_can_sign_in(int $userId): bool
{
    $stmt = db()->prepare('SELECT username, is_active FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $row = $stmt->fetch();

    return $row !== false && (int) $row['is_active'] === 1 && $row['username'] !== '_guest_';
}

/**
 * The local account owning an email address (case-insensitively, and over the
 * username namespace too, exactly like email_in_use()), or null. Used when an
 * account with no email adopts the social address.
 */
function oauth_email_owner(string $email, int $exceptUserId): ?int
{
    $stmt = db()->prepare(
        'SELECT id FROM users
          WHERE id <> :id
            AND (lower(email) = lower(:email) OR lower(username) = lower(:email))
          LIMIT 1'
    );
    $stmt->execute(['id' => $exceptUserId, 'email' => $email]);
    $id = $stmt->fetchColumn();

    return $id === false ? null : (int) $id;
}

function oauth_state_purge(): void
{
    db()->exec("DELETE FROM oauth_states WHERE expires_at < datetime('now')");
}

/**
 * Step 1: remember the request, then hand the browser to the provider.
 */
function oauth_start(): never
{
    $provider = strtolower(trim((string) request_param('provider', '')));
    $definition = oauth_provider($provider);

    if ($definition === null || !oauth_provider_enabled($provider)) {
        oauth_fail('provider_unavailable');
    }

    $mode = request_param('mode', 'login') === 'bind' ? 'bind' : 'login';
    $user = current_user();

    if ($mode === 'bind') {
        if ($user === null) {
            oauth_fail('not_signed_in');
        }

        if ((int) $user['must_change_password'] === 1) {
            oauth_fail('password_change_required', 'account');
        }
    }

    $next = oauth_normalize_next(
        request_param('next'),
        $mode === 'bind' ? '/admin/account' : '/admin/sifront'
    );

    oauth_state_purge();

    $state = bin2hex(random_bytes(24));
    $verifier = oauth_base64url(random_bytes(48));
    $challenge = oauth_base64url(hash('sha256', $verifier, true));

    db()->prepare(
        'INSERT INTO oauth_states (state_hash, provider, mode, user_id, next, code_verifier, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        hash('sha256', $state),
        $provider,
        $mode,
        $mode === 'bind' ? (int) $user['id'] : null,
        $next,
        $verifier,
        gmdate('Y-m-d H:i:s', time() + OAUTH_STATE_TTL),
    ]);

    oauth_state_cookie_set($state);

    $params = [
        'client_id' => oauth_provider_config($provider, 'client_id'),
        'redirect_uri' => oauth_redirect_uri($provider),
        'response_type' => 'code',
        'scope' => $definition['scope'],
        'state' => $state,
        'code_challenge' => $challenge,
        'code_challenge_method' => 'S256',
        'access_type' => 'online',
    ];

    /* Linking an account should offer the account chooser, so a user with
     * several Google sessions can pick the right one. */
    if ($mode === 'bind') {
        $params['prompt'] = 'select_account';
    }

    oauth_redirect($definition['authorize'] . '?' . http_build_query($params));
}

/**
 * Step 2: validate the callback, exchange the code, then sign in or link.
 */
function oauth_callback(): never
{
    $state = (string) request_param('state', '');
    $code = (string) request_param('code', '');
    $providerError = (string) request_param('error', '');
    $cookieState = (string) ($_COOKIE['oauth_state'] ?? '');

    oauth_state_cookie_clear();

    if ($state === '' || $cookieState === '' || !hash_equals($cookieState, $state)) {
        oauth_fail('state_invalid');
    }

    $stateHash = hash('sha256', $state);
    $stmt = db()->prepare(
        'SELECT provider, mode, user_id, next, code_verifier, expires_at
           FROM oauth_states WHERE state_hash = ?'
    );
    $stmt->execute([$stateHash]);
    $row = $stmt->fetch();

    /* Single use: the row is gone whether or not the rest of the flow
     * succeeds, so a replayed callback can never mint a second session. */
    db()->prepare('DELETE FROM oauth_states WHERE state_hash = ?')->execute([$stateHash]);

    if ($row === false) {
        oauth_fail('state_invalid');
    }

    if (strtotime((string) $row['expires_at'] . ' UTC') < time()) {
        oauth_fail('state_invalid');
    }

    $provider = (string) $row['provider'];
    $mode = $row['mode'] === 'bind' ? 'bind' : 'login';

    if (oauth_provider($provider) === null || !oauth_provider_enabled($provider)) {
        oauth_fail('provider_unavailable', $mode === 'bind' ? 'account' : 'login');
    }

    $target = $mode === 'bind' ? 'account' : 'login';

    /* A consent denial is a normal callback: the state is already consumed, so
     * the browser can be sent back with a plain "cancelled" flag. */
    if ($providerError !== '') {
        oauth_fail($providerError === 'access_denied' ? 'access_denied' : 'provider_error', $target);
    }

    if ($code === '') {
        oauth_fail('provider_error', $target);
    }

    $accessToken = oauth_exchange_code($provider, $code, (string) $row['code_verifier']);

    if ($accessToken === null) {
        oauth_fail('exchange_failed', $target);
    }

    $profile = oauth_fetch_profile($provider, $accessToken);

    if ($profile === null || $profile['subject'] === '') {
        oauth_fail('profile_failed', $target);
    }

    if ($profile['email'] === '') {
        oauth_fail('email_missing', $target);
    }

    if (!$profile['email_verified']) {
        oauth_fail('email_not_verified', $target);
    }

    if ($mode === 'bind') {
        oauth_finish_bind($row, $provider, $profile);
    }

    oauth_finish_login($row, $provider, $profile);
}

/**
 * Link the provider identity to the signed-in account and bounce back to My
 * Account. `$row` is the consumed oauth_states row.
 */
function oauth_finish_bind(array $row, string $provider, array $profile): never
{
    $user = current_user();
    $userId = $row['user_id'] === null ? null : (int) $row['user_id'];

    if ($user === null || $userId === null || (int) $user['id'] !== $userId) {
        oauth_fail('not_signed_in');
    }

    $identity = oauth_identity_row($provider, $profile['subject']);

    if ($identity !== null && $identity['user_id'] !== $userId) {
        oauth_fail('identity_taken', 'account');
    }

    if ($identity === null) {
        $stmt = db()->prepare('SELECT email FROM users WHERE id = ?');
        $stmt->execute([$userId]);
        $accountEmail = $stmt->fetchColumn();
        $accountEmail = is_string($accountEmail) ? trim($accountEmail) : '';

        /* The whole point of the feature: the provider email has to match the
         * account. An account without one adopts the social address. */
        if ($accountEmail !== '' && strcasecmp($accountEmail, $profile['email']) !== 0) {
            oauth_fail('email_mismatch', 'account');
        }

        if ($accountEmail === '') {
            if (oauth_email_owner($profile['email'], $userId) !== null) {
                oauth_fail('email_taken', 'account');
            }

            db()->prepare(
                "UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?"
            )->execute([$profile['email'], $userId]);
        }

        try {
            db()->prepare(
                'INSERT INTO user_identities (user_id, provider, subject, email, email_verified)
                 VALUES (?, ?, ?, ?, 1)'
            )->execute([$userId, $provider, $profile['subject'], $profile['email']]);
        } catch (PDOException $e) {
            /* Concurrent link for the same identity: the unique key wins, and
             * only a link to this very user is acceptable here. */
            $identity = oauth_identity_row($provider, $profile['subject']);

            if ($identity === null || $identity['user_id'] !== $userId) {
                oauth_fail('identity_taken', 'account');
            }
        }
    } else {
        oauth_identity_touch($provider, $profile['subject'], $profile['email']);
    }

    $next = oauth_normalize_next((string) $row['next'], '/admin/account');

    oauth_redirect(route_url('sifpress' . $next, ['social' => 'linked']));
}

/**
 * Sign in through the identity when it is known, otherwise through an
 * existing local account whose email matches. No account is ever created.
 */
function oauth_finish_login(array $row, string $provider, array $profile): never
{
    $next = oauth_normalize_next((string) $row['next'], '/admin/sifront');
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

    $identity = oauth_identity_row($provider, $profile['subject']);

    if ($identity !== null) {
        $userId = $identity['user_id'];

        if (!oauth_user_can_sign_in($userId)) {
            oauth_fail('account_inactive');
        }

        oauth_identity_touch($provider, $profile['subject'], $profile['email']);
        login_attempt_record($profile['email'], $ip, $userId, true);
        create_session($userId);
        oauth_redirect(route_url('sifpress' . $next));
    }

    if (!oauth_auto_link()) {
        oauth_fail('no_account');
    }

    /*
     * Compare against the local accounts. `LIMIT 2` is enough to tell a
     * unique match from a collision: two accounts sharing an email (possible
     * before the uniqueness checks, or differing only in case) must not be
     * guessed at.
     */
    $stmt = db()->prepare(
        "SELECT id FROM users
          WHERE email IS NOT NULL
            AND lower(email) = lower(:email)
            AND is_active = 1
            AND username <> '_guest_'
          LIMIT 2"
    );
    $stmt->execute(['email' => $profile['email']]);
    $matches = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));

    if ($matches === []) {
        oauth_fail('no_account');
    }

    if (count($matches) > 1) {
        oauth_fail('email_ambiguous');
    }

    $userId = $matches[0];

    /* Two concurrent callbacks for the same Google account can reach this
     * insert together; the unique key decides, and the loser re-reads instead
     * of failing the request. */
    try {
        db()->prepare(
            'INSERT INTO user_identities (user_id, provider, subject, email, email_verified)
             VALUES (?, ?, ?, ?, 1)'
        )->execute([$userId, $provider, $profile['subject'], $profile['email']]);
    } catch (PDOException $e) {
        $identity = oauth_identity_row($provider, $profile['subject']);

        if ($identity === null || $identity['user_id'] !== $userId) {
            oauth_fail('identity_taken');
        }
    }

    login_attempt_record($profile['email'], $ip, $userId, true);
    create_session($userId);
    oauth_redirect(route_url('sifpress' . $next));
}

/**
 * `?p=sifpress/oauth` dispatch. Every branch ends in a redirect back into the
 * SPA, so this endpoint never serves HTML or JSON of its own.
 */
function handle_oauth(string $action, string $method): never
{
    if (db_needs_migration()) {
        http_response_code(503);
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        header('Retry-After: 60');
        echo 'Sifpress is migrating; try again shortly.';
        exit;
    }

    if ($method !== 'GET') {
        http_response_code(405);
        header('Allow: GET');
        header('Content-Type: text/plain; charset=utf-8');
        header('Cache-Control: no-store');
        echo 'Method not allowed';
        exit;
    }

    if ($action === 'start') {
        oauth_start();
    }

    if ($action === 'callback') {
        oauth_callback();
    }

    http_response_code(404);
    header('Content-Type: text/plain; charset=utf-8');
    header('Cache-Control: no-store');
    echo 'Unknown OAuth action.';
    exit;
}
