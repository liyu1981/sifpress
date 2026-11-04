# Plan — Social sign-in (Google first)

Sifpress accounts are admin-managed and local: a username, a password hash, and
an email that doubles as a login credential. This plan adds an **external
identity** to that model without changing it: a user can sign in with Google,
and Google's email must equal the local account's email. No account is ever
created by the provider.

Related: `src/oauth.php` (the implementation), `src/auth.php` (sessions/RBAC),
AGENTS.md → Backend model → Auth → Social sign-in.

---

## 1. Goals

1. Sign in with Google (`OAuth 2.0` + `OpenID Connect`), server-side
   authorization-code flow with **PKCE** and a CSRF `state`.
2. The provider's **verified email** is the join key: it is compared against
   `users.email` (case-insensitive). Exactly one active account may match.
3. A local account can **bind** a social login from My Account, and unbind it.
4. The client secret never reaches the browser; no JS OAuth library, no token
   storage in the SPA.
5. Adding a second provider is a registry entry, not a schema change.

Non-goals for v1: self-service sign-up (auto-provisioning), providers other
than Google, social-only accounts with no local password, multiple linked
accounts per provider (one Google account per user), revoking access at the
provider on unlink, mapping provider groups/roles to RBAC.

---

## 2. Data model (migration `0028_social_login.sql`)

```
user_identities
  id, user_id → users(id) ON DELETE CASCADE
  provider    'google'
  subject     provider's stable user id (Google's `sub`)
  email       snapshot of the asserted address (audit only)
  email_verified, created_at, last_used_at
  UNIQUE (provider, subject)   one local user per Google account
  UNIQUE (user_id, provider)   one Google account per local user

oauth_states
  state_hash (PK)  sha256 of the state sent to the provider
  provider, mode ('login' | 'bind'), user_id (bind only), next
  code_verifier    PKCE verifier, never leaves the server
  created_at, expires_at (10 min)
```

Provider credentials are **config constants in `sifpress_config.php`**, not
database settings — they are server infrastructure (like `SIFPRESS_DB_DIR`),
they are only readable by the operator who owns the file, and nothing about
them belongs in an HTTP API or a backup archive:

| constant | meaning |
| --- | --- |
| `SIFPRESS_GOOGLE_CLIENT_ID` | OAuth client id |
| `SIFPRESS_GOOGLE_CLIENT_SECRET` | OAuth client secret (masked by `config`) |
| `SIFPRESS_GOOGLE_REDIRECT_URI` | optional pin; empty = derived from the request |
| `SIFPRESS_SOCIAL_AUTO_LINK` | `false` disables email auto-linking at sign-in |

There is **no enable flag**: a provider is enabled exactly when its client id
and secret are both defined and non-empty (blank them to switch it off). The
constants are read with `defined()`/`constant()` on every request, so editing
the file takes effect on the next request — no rebuild, no restart, no
migration. Installs whose config file predates them keep working (undefined =
not configured), and `php sifpress.php config --set KEY=VALUE` appends the
missing `define()`s.

---

## 3. Flow

```
browser                     artifact                        provider
  │  GET ?p=oauth&action=start&provider=google&mode=login&next=/admin/x
  │ ────────────────────────►│
  │                          │ state = random, PKCE verifier
  │                          │ INSERT oauth_states(sha256(state), …)
  │  ◄── 302 + oauth_state cookie (HttpOnly, 10 min)
  │  ─────────────────────────────────────────────────────────────►│
  │  ◄── 302 ?p=oauth&action=callback&state=…&code=… ───────────────│
  │ ────────────────────────►│
  │                          │ cookie == state, row present & fresh → DELETE row
  │                          │ POST token (code + verifier + secret)
  │                          │ GET  userinfo (Bearer)
  │  ◄── 302 /admin/…        │ email verified? → identity? → email match?
```

Sign-in (`mode=login`):

1. `(provider, subject)` already linked → sign that user in (must be active,
   not `_guest_`).
2. else `SIFPRESS_SOCIAL_AUTO_LINK` is on → find active accounts with
   `lower(users.email) = lower(provider email)`.
   - exactly one → insert the link and sign in,
   - none → `no_account`,
   - more than one → `email_ambiguous` (never guess).
3. else → `no_account`.

Link (`mode=bind`, requires a session and no pending password change):

1. The identity must not be linked to a different user (`identity_taken`).
2. The provider email must equal the account email (`email_mismatch`). An
   account with **no** email adopts the provider one, unless another user or
   username already owns it (`email_taken`).
3. Idempotent: re-linking the same identity just refreshes `last_used_at`.

Outcomes reach the SPA as query flags on the redirect:
`?social=linked` (My Account), `?social_error=<code>` (login page, or My
Account for bind failures). The codes are i18n keys (`social.error.<code>`), so
an unknown code degrades to a generic sentence instead of leaking a raw key.

---

## 4. Endpoints

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET ?p=oauth&action=start` | — | 302 to the provider; `mode`, `next`, `provider` |
| `GET ?p=oauth&action=callback` | — | 302 back into the SPA, sets the session |
| `GET api auth.providers` | public | enabled providers (login buttons) |
| `GET api auth.identities` | session | provider list + this user's link state |
| `POST api auth.unlinkIdentity` | session | remove own link (`{provider}`) |
| `GET api social.get` | `settings.manage` | read-only status: enabled flags, client id, `has_secret`, effective callback URL, `config_snippet` |

Nothing writes configuration over HTTP: the admin card shows what
`sifpress_config.php` says, offers the callback URL and a ready-to-paste
constants block for the operator to edit.

---

## 5. Security notes

- **Login CSRF**: the callback requires the `state` in the URL to hash to the
  stored row *and* the browser to carry the matching HttpOnly `oauth_state`
  cookie, so an attacker cannot hand a victim a callback URL that signs the
  victim into the attacker's account.
- **Code replay**: the state row is deleted before the exchange, so a callback
  is single-use even if the flow fails afterwards.
- **PKCE (S256)**: an intercepted authorization code is useless without the
  verifier, which exists only in the DB.
- **Email trust**: only a verified email is compared; unverified / missing
  emails are refused (`email_not_verified`, `email_missing`).
- **No open redirect**: `next` must match `^/[A-Za-z0-9._~/-]{0,200}$`, cannot
  contain `..` or start with `//`, and never leaves the SPA's own routes.
- **No secrets in responses or the DB**: the client secret only ever exists in
  `sifpress_config.php`; the API and the admin card report `has_secret`, and
  no `social_*` row is written to the settings table at all.
- **Unlinking** needs a session only. A link is not a credential (the password
  is untouched) and every account keeps a password hash, so no lockout is
  possible.
- Successful social sign-ins are written to `login_attempts` (audit); failed
  ones are not, so a password-login lockout cannot be triggered through OAuth.

---

## 6. Setup (Google)

The full operator walkthrough — console steps, the exact callback URI for each
URL mode, the config constants, who is allowed to sign in, and a
troubleshooting table — lives in [`google-login-setup.md`](google-login-setup.md).

---

## 7. Frontend surface

- **Login page** (`admin_ui/src/pages/login.tsx`): when at least one provider
  is enabled, the panel **leads with the social buttons** and the
  username/password form starts collapsed behind an "or → sign in with a
  username and password" disclosure (expanding focuses the username field,
  and it can be collapsed again). With no provider enabled the page is the
  classic password form unchanged. The localized `social_error` banner sits
  above both paths; the provider list is awaited before the layout is chosen
  so the form never flashes open and then collapses.
- **My Account** (`admin_ui/src/pages/settings.tsx` → `LinkedAccountsCard`):
  per-provider Connect/Disconnect; a linked provider stays visible even after
  an administrator disables it, so the link can still be removed.
- **Settings → Social login** (`SocialSettingsCard`, `settings.manage`):
  read-only status (enabled, client id, secret stored, auto-link), the
  effective redirect URI with a copy button, a link to the Google credentials
  page, and the generated `sifpress_config.php` snippet with a copy button.
- `ui_sdk`: `socialStartUrl()` (browser navigation, not `fetch`),
  `authApi.socialProviders/identities/unlinkIdentity`,
  `socialSettingsApi.get` (read-only), and the `SocialProvider` /
  `SocialIdentity` / `SocialSettings` types.

---

## 8. Deliberate follow-ups

- Second provider (GitHub, Microsoft): add an entry to `oauth_providers()`
  (authorize/token/userinfo URLs + scope) and a settings prefix; the tables and
  the callback need no change.
- Optional provider endpoints override (`oauth_http` already funnels every
  call) would enable generic OIDC discovery.
- `oauth_providers()` only carries the endpoint URLs; a generic OIDC provider
  (discovery + issuer override constants) would make the registry fully
  data-driven.
- The admin card could offer a "test configuration" button that runs the
  authorization redirect in a popup; today the first real test is the login
  page itself.
