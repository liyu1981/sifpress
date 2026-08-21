import { createRouter } from '@tanstack/react-router';
import { createQueryRewrite } from 'ui-sdk';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  rewrite: createQueryRewrite(),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
