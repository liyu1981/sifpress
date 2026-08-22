import { parseFrontMatter, type PageListItem } from 'ui-sdk';
import { ArticleCard, type ArticleCardData } from '@/components/article-card';

function firstTextLine(md: string): string {
  const body = md.replace(/^---[\s\S]*?---\s*/, '');
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    if (line === '' || /^#{1,6}\s/.test(line) || /^!\[/.test(line)) continue;
    return line
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_`~]/g, '')
      .trim();
  }
  return '';
}

function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function toCardData(article: PageListItem): ArticleCardData {
  const { data, content } = parseFrontMatter(article.content_md);
  const cover = typeof data.cover === 'string' && data.cover !== '' ? data.cover : null;

  return {
    slug: article.slug,
    title: article.title,
    excerpt: firstTextLine(article.content_md),
    cover,
    reading_minutes: estimateReadingMinutes(content),
    author: article.created_by_name !== '' ? article.created_by_name : null,
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
