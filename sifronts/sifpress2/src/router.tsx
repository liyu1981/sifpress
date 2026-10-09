import { createRouter } from '@tanstack/react-router';
import { createQueryRewrite } from 'ui-sdk';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  // Root-mounted sifront: no `sifpress/` prefix, so links stay on the
  // catch-all sifront route instead of colliding with backend modules.
  // `inspect` and `preview` are kept across navigation so ?inspect=1 and
  // ?preview=1 stay on the address bar (see ui-sdk inspect.tsx / preview.ts).
  rewrite: createQueryRewrite(undefined, '', ['inspect', 'preview']),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
