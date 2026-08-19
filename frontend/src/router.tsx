import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

function normalizeInternalPath(path: string): string {
  path = path.startsWith('/') ? path : '/' + path;
  return path.replace(/\/+$/, '');
}

const basePath = window.location.pathname;

export const router = createRouter({
  routeTree,
  rewrite: {
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
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
