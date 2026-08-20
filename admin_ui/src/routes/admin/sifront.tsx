import { createFileRoute } from '@tanstack/react-router';
import { SifrontsPage } from '@/pages/sifront';

export const Route = createFileRoute('/admin/sifront')({
  component: SifrontsPage,
});
