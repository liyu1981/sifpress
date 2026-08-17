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
      const u = url.searchParams.get('u');

      url.searchParams.delete('u');
      url.pathname = u != null && u !== '' ? normalizeInternalPath(u) : '/';

      return url;
    },
    output: ({ url }) => {
      const internalPath = url.pathname;

      url.pathname = basePath;

      if (internalPath === '/') {
        url.searchParams.delete('u');
      } else {
        url.searchParams.set('u', internalPath.replace(/^\//, ''));
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
