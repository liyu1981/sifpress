import { createRouter } from '@tanstack/react-router';
import { createQueryRewrite } from 'ui-sdk';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  // Root-mounted sifront: no `sifpress/` prefix, so links stay on the
  // catch-all sifront route instead of colliding with backend modules.
  // The base path comes from the injected SIFPRESS_BASE_URL.
  // `inspect` is not part of any route's validated search, so it is kept
  // explicitly and survives in-app navigation (see ui-sdk inspect.tsx).
  rewrite: createQueryRewrite(undefined, '', ['inspect']),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
