import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ArticleIndexPage } from '@/pages/article-index';

const articleSearchSchema = z.object({
  tag: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
});

export const Route = createFileRoute('/admin/articles')({
  validateSearch: articleSearchSchema,
  component: ArticleIndexRoute,
});

function ArticleIndexRoute() {
  const { tag, page } = Route.useSearch();
  return <ArticleIndexPage tag={tag} page={page ?? 1} />;
}
