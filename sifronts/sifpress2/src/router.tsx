import { createRouter } from '@tanstack/react-router';
import { createQueryRewrite } from 'ui-sdk';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  // Root-mounted sifront: no `sifpress/` prefix, so links stay on the
  // catch-all sifront route instead of colliding with backend modules.
  // `inspect` is kept across navigation so ?inspect=1 stays on the address
  // bar (see ui-sdk inspect.tsx).
  rewrite: createQueryRewrite(undefined, '', ['inspect']),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
