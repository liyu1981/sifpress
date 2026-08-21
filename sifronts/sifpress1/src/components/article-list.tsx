import type { PageListItem } from 'ui-sdk';
import { ArticleCard } from '@/components/article-card';

export function ArticleList({ articles }: { articles: PageListItem[] }) {
  if (articles.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <p className="text-lg">No articles yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {articles.map(article => (
        <ArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
}
