import { Link } from '@tanstack/react-router';
import { Calendar, Tag } from 'lucide-react';
import type { PageListItem } from 'ui-sdk';
import { cn } from '@/lib/utils';

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^---[\s\S]*?---\s*/, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/[*_`~]/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\n+/g, ' ')
    .trim();
}

export function ArticleCard({ article }: { article: PageListItem }) {
  const excerpt = stripMarkdown(article.content_md).slice(0, 200);
  const tags = article.tags ?? [];

  return (
    <article
      className={cn(
        'glass-control rounded-2xl p-6 transition-all duration-200',
        'hover:shadow-lg hover:-translate-y-0.5',
      )}
    >
      <Link
        to="/article/$slug"
        params={{ slug: article.slug }}
        className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 rounded-xl"
      >
        <h2 className="text-xl font-semibold tracking-tight text-foreground mb-2 leading-snug">
          {article.title}
        </h2>
      </Link>

      {excerpt && (
        <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-3">
          {excerpt}
          {excerpt.length >= 200 ? '…' : ''}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Calendar className="size-3.5" />
          {formatDate(article.updated_at)}
        </span>

        {tags.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <Tag className="size-3.5" />
            {tags.join(', ')}
          </span>
        )}

        {article.created_by_name && (
          <span className="ml-auto text-muted-foreground/70">by {article.created_by_name}</span>
        )}
      </div>
    </article>
  );
}
