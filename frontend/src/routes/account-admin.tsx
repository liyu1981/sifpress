import { createFileRoute } from '@tanstack/react-router';
import { AccountAdminPage } from '@/pages/settings';

export const Route = createFileRoute('/account-admin')({
  component: AccountAdminPage,
});
