import { createFileRoute } from '@tanstack/react-router';
import { KvsPage } from '@/pages/kvs';

export const Route = createFileRoute('/admin/kvs')({
  component: KvsPage,
});
