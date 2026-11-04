# Google sign-in — operator setup

Sifpress can sign users in with Google (OAuth 2.0 / OpenID Connect) next to the
password login. Accounts stay local and admin-managed: Google only proves who
the user is, and the **verified Google email must equal the local account's
email**. No account is ever created by signing in.

Everything is configured in `sifpress_config.php` — the client secret never
enters the database or the HTTP API. The admin UI shows the current state
(Settings → Social login) and can be used to read the exact callback URI.

Related: `docs/social-login-plan.md` (design), AGENTS.md → Backend model →
Auth → Social sign-in.

---

## 1. What you need

- The admin UI reachable over **https** (or `http://localhost` while
  developing) — Google requires https for any non-loopback redirect URI.
- A Google account that can create a Cloud project (the free tier is fine).
- `SIFPRESS_BASE_URL` set to the public URL of the artifact if you are behind
  a proxy/CDN (see [§3](#3-register-the-callback-uri)).

---

## 2. Create the OAuth client

1. **Project** — open <https://console.cloud.google.com/apis/credentials> and
   pick or create a project.
2. **Consent screen** (*Google Auth Platform → Branding / Audience*):
   - *User type*: **External**, or **Internal** if the deployment is on Google
     Workspace and only your organisation should be able to sign in (Internal
     needs no verification at all).
   - Fill in app name, user-support email and developer contact, then save.
   - While the app is in **Testing**, only accounts listed under *Test users*
     can sign in. Add your own while you set things up.
   - The scopes Sifpress asks for are `openid email profile` — **non-sensitive**,
     so publishing the app does not require a security review.
3. **Create client** (*Credentials → Create credentials → OAuth client ID*):
   - *Application type*: **Web application**.
   - *Name*: anything, e.g. `sifpress`.
   - *Authorized JavaScript origins*: **not needed** — the flow is server-side;
     the browser never calls Google's APIs with JavaScript.
   - *Authorized redirect URIs*: the value from [§3](#3-register-the-callback-uri).
4. Copy the **Client ID** and **Client secret**.

> New or changed redirect URIs can take a minute (occasionally longer) to take
> effect. Retry before debugging anything else.

---

## 3. Register the callback URI

The artifact computes the callback URI itself and shows it, with a copy button,
at **Admin → Settings → Social login → Authorized redirect URI**. That string
is byte-for-byte what the server sends to Google, so **copy it rather than
typing it**.

(The same values are in the `social.get` API payload as `redirect_uri` /
`redirect_uri_default`.)

The shape depends on the URL mode (AGENTS.md → "URL modes"):

| Deployment | Callback URI to register |
| --- | --- |
| `?p=` mode (`SIFPRESS_PRETTY_URLS='0'`, or `'auto'` before a clean-path request has been seen) | `https://example.com/sifpress.php?p=sifpress/oauth&action=callback&provider=google` |
| Clean paths (`SIFPRESS_PRETTY_URLS='1'`, or `'auto'` once the rewrite rules are live) | `https://example.com/sifpress/oauth?action=callback&provider=google` |
| Artifact in a subdirectory, clean paths | `https://example.com/app/sifpress/oauth?action=callback&provider=google` |
| Local dev (`./dev.sh`) | `http://localhost:5000/sifpress/oauth?action=callback&provider=google` |

Rules that trip people up:

- **Exact match.** No trailing slash differences, no `http` for a real host.
  `http` is accepted by Google only for `localhost` / `127.0.0.1`.
- **Register both spellings** if the site might switch between `?p=` links and
  clean paths (installing the rewrite rules flips the emitted URI). Google
  accepts several redirect URIs per client (up to 100).
- **Or pin it**, which freezes the value regardless of the URL mode:

  ```php
  define('SIFPRESS_GOOGLE_REDIRECT_URI', 'https://example.com/sifpress/oauth?action=callback&provider=google');
  ```

The host and path come from `SIFPRESS_BASE_URL` (falling back to the `site_url`
setting, then the request). Behind a TLS-terminating proxy, set it explicitly:

```php
define('SIFPRESS_BASE_URL', 'https://example.com/sifpress.php');
```

---

## 4. Give Sifpress the credentials

Add the constants to `sifpress_config.php`:

```php
// Social sign-in (Google). Leave the client id empty to keep it disabled.
define('SIFPRESS_GOOGLE_CLIENT_ID', '1234567890-abc.apps.googleusercontent.com');
define('SIFPRESS_GOOGLE_CLIENT_SECRET', 'GOCSPX-…');

// Optional: pin the callback URL (must match the value registered with Google).
define('SIFPRESS_GOOGLE_REDIRECT_URI', '');

// Optional: link a social account to the local account with the same email on
// sign-in (default true). false = users connect it themselves from My Account.
define('SIFPRESS_SOCIAL_AUTO_LINK', true);
```

The provider is **enabled exactly when the client id and secret are both
non-empty** — there is no separate switch, and blanking them removes the login
button.

Two shortcuts:

- **Settings → Social login → Copy snippet** produces the block above, already
  annotated with this deployment's callback URL.
- **CLI** (appends the constants when the file predates them, casts
  `SIFPRESS_SOCIAL_AUTO_LINK` as a boolean, and masks the secret in output):

  ```bash
  php sifpress.php config \
    --set SIFPRESS_GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com \
    --set SIFPRESS_GOOGLE_CLIENT_SECRET=GOCSPX-…
  ```

**An existing config file does not gain the new constants by itself.** Refresh
it from the current template without losing any value (the old file is kept as
`.bak`):

```bash
php sifpress.php config --upgrade --dry-run   # preview: preserved / added / carried over
php sifpress.php config --upgrade             # write it
```

No rebuild, migration or restart is needed: the constants are read on every
request.

---

## 5. Verify

1. **Settings → Social login** shows Google as **Enabled**, the client id, the
   secret as *Stored*, the email-auto-linking mode, and the callback URI.
2. The login page now leads with **Continue with Google**, with the
   username/password form collapsed behind a disclosure.
3. Sign in with a Google account whose email matches a local account:

   - first time: the identity is linked to that account, then signed in;
   - afterwards: the link is used directly (the email may even change later).

4. **My Account → Linked accounts** shows the Google row as connected, with a
   *Disconnect* button. Users can also connect a provider there themselves
   (then the Google email must equal the account email; an account with no
   email adopts the Google address).

With `SIFPRESS_SOCIAL_AUTO_LINK=false`, step 3 only works for accounts that
already have the link; everyone else connects from My Account.

---

## 6. Who is allowed to sign in

| Situation | Result |
| --- | --- |
| Google account already linked | signed in (the link is the key; changing the Google email does not break it) |
| Verified Google email equals exactly one active local account | linked + signed in (unless auto-linking is off) |
| No local account uses that email | refused: `no_account` — accounts stay admin-managed, nothing is auto-created |
| Several local accounts share that email (differing case) | refused: `email_ambiguous` |
| Google reports the email as unverified / missing | refused: `email_not_verified` / `email_missing` |
| The local account is deactivated | refused: `account_inactive` |
| The Google identity is already linked to another user | refused: `identity_taken` |

Failures come back to the UI as `?social_error=<code>` and are shown on the
login page (or on My Account for link failures) with a localized message.

---

## 7. Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `redirect_uri_mismatch` (Google's own error page) | The registered URI differs from the one on the settings card. Copy the URI out of Google's error text, or pin `SIFPRESS_GOOGLE_REDIRECT_URI` and register that. Watch for mode flips (`?p=` vs clean paths) and for a trailing slash. |
| `provider_unavailable` | `SIFPRESS_GOOGLE_CLIENT_ID` / `_CLIENT_SECRET` are not both defined — check you edited the config file **next to the running artifact** (`sifpress_config.php`), not a copy elsewhere. |
| Google shows "Access blocked / app not verified" | Consent screen is in *Testing*: add the account as a test user, or publish the app (the scopes are non-sensitive, so no review is needed). |
| `exchange_failed` | The token exchange failed: clock skew, outbound HTTPS blocked (curl/open_basedir), or a wrong client secret. Server error log has nothing sensitive — the redirect code is generic on purpose. |
| `state_invalid` | The callback was older than 10 minutes, already used, or arrived in a different browser than the one that started it (the `oauth_state` cookie is required — this is the login-CSRF guard). |
| Sign-in works, then a redirect to `/admin/login` | Check `SIFPRESS_BASE_URL` and the cookie path: a mismatch puts the session cookie at a path the SPA does not send. |
| Button missing on the login page | One of the two constants is empty, or the page is cached — reload; the provider list is fetched per page load. |

---

## 8. Security properties

- **Server-side authorization-code flow** with **PKCE (S256)**: the client
  secret and the code verifier never reach the browser.
- **Single-use state** stored hashed in `oauth_states` (10 min) *plus* an
  HttpOnly `oauth_state` cookie, so a callback URL cannot be replayed into
  someone else's browser (login CSRF).
- **Only a verified email** is compared, and only against an *active* local
  account; no account is created, passwords are never touched.
- **No secrets in the API or the DB**: `social.get` reports `has_secret`, never
  the value; the settings table holds no social rows at all.
- **No open redirect**: `next` is restricted to internal SPA paths.

---

## 9. Adding another provider

`oauth_providers()` in `src/oauth.php` is the registry (authorize / token /
userinfo URLs + scope). A provider with id `foo` is configured by
`SIFPRESS_FOO_CLIENT_ID`, `SIFPRESS_FOO_CLIENT_SECRET` and optionally
`SIFPRESS_FOO_REDIRECT_URI`; tables, endpoints and the UI need no change.
