import { createFileRoute } from '@tanstack/react-router';
import { AccountManagementPage } from '@/pages/settings';

export const Route = createFileRoute('/admin/account')({
  component: AccountManagementPage,
});
