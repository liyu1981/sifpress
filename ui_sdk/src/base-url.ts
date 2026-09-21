/**
 * Base URL shared by every ui-sdk URL builder.
 *
 * Same-origin URLs are derived from the current document path, so the bundle
 * always talks to the host it was served from (see `appBaseUrl`). The PHP
 * artifact also injects `window.SIFPRESS_BASE_URL` (from the
 * `SIFPRESS_BASE_URL` config constant or the `site_url` setting); it is used
 * only as a fallback for contexts without a document (e.g. isolated tests).
 */
declare global {
  interface Window {
    SIFPRESS_BASE_URL?: string;
  }
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Root-relative base for API/asset/chunk URLs. The single-file artifact always
 * serves those from the path the document was loaded from, so that path is
 * authoritative: a host alias (apex vs `www`, a preview domain, the LAN IP
 * during dev) must never turn same-origin fetches into cross-origin ones. The
 * injected `SIFPRESS_BASE_URL` is only a fallback for contexts without a
 * document (tests, SSR).
 */
export function appBaseUrl(): string {
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
