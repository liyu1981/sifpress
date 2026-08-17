import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ArticleIndexPage } from '@/pages/article-index';

const articleSearchSchema = z.object({
  tag: z.string().optional(),
});

export const Route = createFileRoute('/article')({
  validateSearch: articleSearchSchema,
  component: ArticleIndexRoute,
});

function ArticleIndexRoute() {
  const { tag } = Route.useSearch();
  return <ArticleIndexPage tag={tag} />;
}
