import { createFileRoute } from '@tanstack/react-router';
import { AssetsPage } from '@/pages/assets';

export const Route = createFileRoute('/assets')({
  component: AssetsPage,
});
