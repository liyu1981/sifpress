import type { PageListItem } from 'ui-sdk';
import { ArticleCard, type ArticleCardData } from '@/components/article-card';

function stripMarkdown(md: string): string {
  return md
    .replace(/^---[\s\S]*?---\s*/, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
}

function toCardData(article: PageListItem): ArticleCardData {
  const text = stripMarkdown(article.content_md);
  const truncated = text.length > 300;

  return {
    slug: article.slug,
    title: article.title,
    excerpt: text.slice(0, 300) + (truncated ? '…' : ''),
    tags: article.tags ?? [],
    updated_at: article.updated_at,
  };
}

export function ArticleList({ articles }: { articles: PageListItem[] }) {
  if (articles.length === 0) {
    return (
      <div className="glass-control rounded-2xl p-8 text-center text-muted-foreground">
        <p className="font-serif text-lg">No articles yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {articles.map(article => (
        <ArticleCard key={article.id} article={toCardData(article)} />
      ))}
    </div>
  );
}
