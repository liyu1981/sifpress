import type { LocationRewrite } from '@tanstack/react-router';
import { appBasePath, prettyUrls } from './base-url';

function normalizeInternalPath(path: string): string {
  path = path.startsWith('/') ? path : '/' + path;
  return path.replace(/\/+$/, '');
}

/** Module prefix as a path segment: 'sifpress/' -> '/sifpress', '' -> ''. */
function moduleSegment(prefix: string): string {
  const trimmed = prefix.replace(/\/+$/, '');
  return trimmed === '' ? '' : '/' + trimmed;
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
 * When the artifact is serving clean paths (`?p=` copied from the request
 * path, see src/urlmode.php) the same mapping applies to paths instead:
 * `/sifpress/admin/assets` <-> `/admin/assets` for the admin SPA,
 * `/article/hello-world` <-> `/article/hello-world` for a root-mounted
 * sifront. Both spellings keep working in both modes — a link, a bookmark or a
 * pushState entry from either world resolves to the same route.
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

      if (p != null && p !== '') {
        url.pathname = normalizeInternalPath(
          prefix !== '' && p.startsWith(prefix) ? p.slice(prefix.length) : p,
        );

        return url;
      }

      if (!prettyUrls()) {
        url.pathname = '/';

        return url;
      }

      /*
       * Clean-path mode: the browser path already carries the route. Strip
       * the artifact's mount, then the module prefix, so a sifront mounted at
       * /app sees /app/article/x as /article/x and the admin SPA sees
       * /sifpress/admin/x as /admin/x.
       */
      const mount = appBasePath().replace(/\/+$/, '');
      const segment = moduleSegment(prefix);
      let path = url.pathname;

      if (mount !== '' && path.startsWith(mount + '/')) {
        path = path.slice(mount.length);
      }

      path = normalizeInternalPath(path);

      if (segment !== '' && (path === segment || path.startsWith(segment + '/'))) {
        path = normalizeInternalPath(path.slice(segment.length));
      }

      /* The artifact URL itself (?p=, or /index.php typed by hand) is the
       * site root, not a route. */
      url.pathname = path === '' || /\.php$/i.test(path) ? '/' : path;

      return url;
    },
    output: ({ url }) => {
      const internalPath = url.pathname;

      if (prettyUrls()) {
        const mount = (basePath ?? appBasePath()).replace(/\/+$/, '');
        const segment = moduleSegment(prefix);
        const tail = internalPath === '/' ? '' : normalizeInternalPath(internalPath);

        url.pathname = mount + (tail === '' ? (segment === '' ? '/' : segment) : segment + tail);

        for (const [name, value] of kept) {
          if (!url.searchParams.has(name)) {
            url.searchParams.set(name, value);
          }
        }

        return url;
      }

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
