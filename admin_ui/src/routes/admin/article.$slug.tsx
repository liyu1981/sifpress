import { createFileRoute } from '@tanstack/react-router';
import { ArticleDetailPage } from '@/pages/article-detail';

export const Route = createFileRoute('/admin/article/$slug')({
  component: ArticleDetailRoute,
});

function ArticleDetailRoute() {
  const { slug } = Route.useParams();
  return <ArticleDetailPage slug={slug} />;
}
