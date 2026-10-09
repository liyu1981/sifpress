import { createRouter } from '@tanstack/react-router';
import { createQueryRewrite } from 'ui-sdk';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  // Root-mounted sifront: no `sifpress/` prefix, so links stay on the
  // catch-all sifront route instead of colliding with backend modules.
  // The base path comes from the injected SIFPRESS_BASE_URL.
  // `inspect` and `preview` are not part of any route's validated search, so
  // they are kept explicitly and survive in-app navigation (see ui-sdk
  // inspect.tsx / preview.ts).
  rewrite: createQueryRewrite(undefined, '', ['inspect', 'preview']),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
