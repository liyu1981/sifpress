import type { LocationRewrite } from '@tanstack/react-router';

function normalizeInternalPath(path: string): string {
  path = path.startsWith('/') ? path : '/' + path;
  return path.replace(/\/+$/, '');
}

/**
 * Build the TanStack Router `rewrite` config for a single-file backend that
 * addresses every route through the `?p=` query parameter (see src/router.php).
 *
 * - `input` (browser URL -> router): reads `?p=/admin/...` and turns it into
 *   the internal path the route tree matches on.
 * - `output` (router -> browser URL): turns the internal path back into a
 *   `?p=...` query on the current document, so `<Link>` hrefs stay real and
 *   shareable at any mount depth.
 */
export function createQueryRewrite(basePath: string = window.location.pathname): LocationRewrite {
  return {
    input: ({ url }) => {
      const p = url.searchParams.get('p');

      url.searchParams.delete('p');
      url.pathname = p != null && p !== '' ? normalizeInternalPath(p) : '/';

      return url;
    },
    output: ({ url }) => {
      const internalPath = url.pathname;

      url.pathname = basePath;

      if (internalPath === '/') {
        url.searchParams.delete('p');
      } else {
        url.searchParams.set('p', internalPath.replace(/^\//, ''));
      }

      return url;
    },
  };
}
