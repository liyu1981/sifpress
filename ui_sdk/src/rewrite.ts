import type { LocationRewrite } from '@tanstack/react-router';
import { appBasePath } from './base-url';

function normalizeInternalPath(path: string): string {
  path = path.startsWith('/') ? path : '/' + path;
  return path.replace(/\/+$/, '');
}

/**
 * Build the TanStack Router `rewrite` config for a single-file backend that
 * addresses every route through the `?p=` query parameter (see src/router.php).
 *
 * - `input` (browser URL -> router): reads `?p=...`, strips the prefix
 *   (default `sifpress/`, pass '' for a root-mounted sifront), and turns
 *   it into the internal path the route tree matches on.
 * - `output` (router -> browser URL): turns the internal path back into a
 *   `?p=...` query on the current document, so `<Link>` hrefs stay
 *   real and shareable at any mount depth.
 *
 * `basePath` overrides the document path used for generated hrefs; when
 * omitted it comes from the injected `SIFPRESS_BASE_URL` (see base-url.ts).
 */
export function createQueryRewrite(
  basePath?: string,
  prefix: string = 'sifpress/',
): LocationRewrite {
  return {
    input: ({ url }) => {
      const p = url.searchParams.get('p');

      url.searchParams.delete('p');

      if (p && p.startsWith(prefix)) {
        url.pathname = normalizeInternalPath(p.slice(prefix.length));
      } else {
        url.pathname = p != null && p !== '' ? normalizeInternalPath(p) : '/';
      }

      return url;
    },
    output: ({ url }) => {
      const internalPath = url.pathname;

      url.pathname = basePath ?? appBasePath();

      if (internalPath === '/') {
        url.searchParams.delete('p');
      } else {
        url.searchParams.set('p', prefix + internalPath.replace(/^\//, ''));
      }

      return url;
    },
  };
}
