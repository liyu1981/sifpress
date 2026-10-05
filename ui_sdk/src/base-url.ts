/**
 * Base URL shared by every ui-sdk URL builder.
 *
 * Same-origin URLs are derived from the current document path, so the bundle
 * always talks to the host it was served from (see `appBaseUrl`). The PHP
 * artifact also injects `window.SIFPRESS_BASE_URL` (from the
 * `SIFPRESS_BASE_URL` config constant or the `site_url` setting); it is used
 * only as a fallback for contexts without a document (e.g. isolated tests).
 *
 * Two more globals describe the *URL mode* the artifact is serving (see
 * src/urlmode.php):
 *
 *   window.SIFPRESS_MOUNT        '' or '/app' — the path the artifact is
 *                                mounted at (e.g. '/app/index.php' -> '/app')
 *   window.SIFPRESS_PRETTY_URLS  1 when the server accepts clean paths
 *                                (/sifpress/api, /article/slug) instead of the
 *                                rewrite-free ?p= form
 *
 * A bundle built before either existed simply sees nothing and keeps emitting
 * `?p=` links, which the artifact still accepts — so a stale cached bundle is
 * never broken by the mode.
 */
declare global {
  interface Window {
    SIFPRESS_BASE_URL?: string;
    SIFPRESS_MOUNT?: string;
    SIFPRESS_PRETTY_URLS?: number | boolean | string;
  }
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Path the artifact is mounted at, without a trailing slash ('' at the
 * document root). Root-relative links must carry it, because they cannot be
 * resolved against the document path any more in clean-path mode.
 */
export function mountPath(): string {
  if (typeof window === 'undefined') {
    return '';
  }

  const injected = window.SIFPRESS_MOUNT;

  if (typeof injected !== 'string') {
    return '';
  }

  return trimTrailingSlashes(injected.trim());
}

/** Whether the server accepts (and the artifact emits) clean-path URLs. */
export function prettyUrls(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const flag = window.SIFPRESS_PRETTY_URLS;

  return flag === 1 || flag === true || flag === '1' || flag === 'true';
}

/**
 * Root-relative base for API/asset/chunk URLs. The single-file artifact always
 * serves those from the path the document was loaded from, so that path is
 * authoritative: a host alias (apex vs `www`, a preview domain, the LAN IP
 * during dev) must never turn same-origin fetches into cross-origin ones. The
 * injected `SIFPRESS_BASE_URL` is only a fallback for contexts without a
 * document (tests, SSR).
 *
 * In clean-path mode the document itself may be an article
 * (`/article/hello-world`), so the base becomes the injected mount path
 * instead of `location.pathname`.
 */
export function appBaseUrl(): string {
  if (prettyUrls()) {
    return mountPath() || '/';
  }

  if (typeof window === 'undefined') {
    return '/';
  }

  const pathname = window.location.pathname;

  if (typeof pathname === 'string' && pathname !== '') {
    return pathname;
  }

  const injected = window.SIFPRESS_BASE_URL;

  if (typeof injected === 'string' && injected.trim() !== '') {
    return trimTrailingSlashes(injected.trim());
  }

  return '/';
}

/**
 * Path-only form of the base, for the router's href rewriting. An absolute
 * injected URL (e.g. `https://example.com/app/index.php`) is reduced to its
 * pathname so TanStack Router can build relative hrefs from it.
 */
export function appBasePath(): string {
  const base = appBaseUrl();

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(base)) {
    try {
      return new URL(base).pathname || '/';
    } catch {
      return '/';
    }
  }

  return base.split(/[?#]/)[0] || '/';
}
