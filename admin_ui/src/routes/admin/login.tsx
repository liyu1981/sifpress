import { createFileRoute } from '@tanstack/react-router';
import { LoginPage } from '@/pages/login';

export const Route = createFileRoute('/admin/login')({
  component: LoginRoute,
});

function LoginRoute() {
  return <LoginPage />;
}
