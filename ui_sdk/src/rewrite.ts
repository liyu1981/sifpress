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
 *
 * `keep` lists query parameters that are not part of the route's validated
 * search and would therefore be dropped on the next navigation — the KV
 * inspect flag (`inspect`, see inspect.tsx) being the one that matters. They
 * are remembered from the browser URL and written back out, so a tool mode
 * switched on with `?inspect=1` survives clicking through the site and stays
 * shareable from the address bar.
 */
export function createQueryRewrite(
  basePath?: string,
  prefix: string = 'sifpress/',
  keep: string[] = [],
): LocationRewrite {
  /*
   * Module-level on purpose: it is per-document state that has to outlive a
   * single rewrite call, and a page only ever runs one router.
   */
  const kept = new Map<string, string>();

  return {
    input: ({ url }) => {
      const p = url.searchParams.get('p');

      for (const name of keep) {
        const value = url.searchParams.get(name);

        if (value === null) {
          kept.delete(name);
        } else {
          kept.set(name, value);
        }
      }

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

      for (const [name, value] of kept) {
        if (!url.searchParams.has(name)) {
          url.searchParams.set(name, value);
        }
      }

      return url;
    },
  };
}
