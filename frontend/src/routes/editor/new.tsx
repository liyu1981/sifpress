import { createFileRoute } from '@tanstack/react-router';
import { EditorPage } from '@/pages/editor';

export const Route = createFileRoute('/editor/new')({
  component: EditorNewRoute,
});

function EditorNewRoute() {
  return <EditorPage slug={null} />;
}
