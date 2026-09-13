import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { EditorPage } from '@/pages/editor';

const editorSearchSchema = z.object({
  revision: z.string().optional(),
});

export const Route = createFileRoute('/admin/editor/$slug')({
  validateSearch: editorSearchSchema,
  component: EditorSlugRoute,
});

function EditorSlugRoute() {
  const { slug } = Route.useParams();
  const { revision } = Route.useSearch();
  return <EditorPage slug={slug} revision={revision} />;
}
