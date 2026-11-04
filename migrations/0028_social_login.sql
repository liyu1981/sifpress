-- Social sign-in (OAuth 2.0 / OpenID Connect) identities.
--
-- One row per (provider, subject): `subject` is the provider's stable user id
-- (Google's `sub`), so a renamed or re-addressed account keeps its link
-- while the display email in `users` may change.
--
-- `email` is a snapshot of what the provider asserted when the link was made;
-- it is audit data, not a join key. Sign-in matches the *local* account
-- through users.email (see src/oauth.php), which is the rule the feature is
-- built on: the provider email has to equal the account email.
--
-- UNIQUE (user_id, provider) means one Google account per local user;
-- UNIQUE (provider, subject) means one local user per Google account.
CREATE TABLE user_identities (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider       TEXT    NOT NULL,
    subject        TEXT    NOT NULL,
    email          TEXT    NOT NULL DEFAULT '',
    email_verified INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
    last_used_at   TEXT,
    UNIQUE (provider, subject),
    UNIQUE (user_id, provider)
);

CREATE INDEX idx_user_identities_email ON user_identities(lower(email));

-- In-flight authorization requests: the CSRF `state` (stored hashed, exactly
-- like session tokens), the PKCE verifier proving this server started the
-- flow, the mode (login vs. link) and where to send the browser afterwards.
-- One row per attempt; expired rows are swept whenever a new flow starts.
CREATE TABLE oauth_states (
    state_hash    TEXT    PRIMARY KEY,
    provider      TEXT    NOT NULL,
    mode          TEXT    NOT NULL DEFAULT 'login',
    user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    next          TEXT    NOT NULL DEFAULT '',
    code_verifier TEXT    NOT NULL,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    expires_at    TEXT    NOT NULL
);

CREATE INDEX idx_oauth_states_expiry ON oauth_states(expires_at);

-- No settings rows: the OAuth client credentials and the auto-link switch are
-- config constants in sifpress_config.php (see src/oauth.php), because they
-- are server infrastructure and must never travel through the HTTP API.
--   SIFPRESS_GOOGLE_CLIENT_ID / SIFPRESS_GOOGLE_CLIENT_SECRET
--   SIFPRESS_GOOGLE_REDIRECT_URI  (optional pin)
--   SIFPRESS_SOCIAL_AUTO_LINK     (default true)
