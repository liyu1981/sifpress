/**
 * Base URL shared by every ui-sdk URL builder.
 *
 * The PHP artifact injects `window.SIFPRESS_BASE_URL` into the served HTML
 * (from the `SIFPRESS_BASE_URL` config constant, the `site_url` setting, or
 * the request). Falling back to the current document path keeps the bundle
 * working even when the script is absent (e.g. isolated tests).
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
 * Absolute (or root-relative) base for API/asset URLs. Prefer the injected
 * value; otherwise use the current document path so the single-file
 * artifact still works at any mount depth.
 */
export function appBaseUrl(): string {
  const injected = typeof window === 'undefined' ? undefined : window.SIFPRESS_BASE_URL;

  if (typeof injected === 'string' && injected.trim() !== '') {
    return trimTrailingSlashes(injected.trim());
  }

  return window.location.pathname;
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
