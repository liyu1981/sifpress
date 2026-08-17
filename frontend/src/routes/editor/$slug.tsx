import { createFileRoute } from '@tanstack/react-router';
import { EditorPage } from '@/pages/editor';

export const Route = createFileRoute('/editor/$slug')({
  component: EditorSlugRoute,
});

function EditorSlugRoute() {
  const { slug } = Route.useParams();
  return <EditorPage slug={slug} />;
}
