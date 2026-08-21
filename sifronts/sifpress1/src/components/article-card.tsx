import { Link } from '@tanstack/react-router';
import { Calendar, Folder } from 'lucide-react';

export interface ArticleCardData {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  updated_at: string;
}

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

export function ArticleCard({ article }: { article: ArticleCardData }) {
  return (
    <article className="glass-control rounded-2xl p-8 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5">
      <Link
        to="/article/$slug"
        params={{ slug: article.slug }}
        className="block focus:outline-none"
      >
        <h2 className="font-mono text-xl font-bold leading-snug text-foreground hover:underline">
          {article.title}
        </h2>
      </Link>

      <p className="mt-4 font-serif text-[15px] leading-7 text-muted-foreground">
        {article.excerpt}
      </p>

      <Link
        to="/article/$slug"
        params={{ slug: article.slug }}
        className="mt-3 inline-block font-serif text-[15px] text-foreground underline decoration-foreground/50 underline-offset-4 transition-colors hover:text-muted-foreground hover:decoration-muted-foreground/50"
      >
        Continue reading →
      </Link>

      <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-border/70 pt-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-3.5" />
          {formatDate(article.updated_at)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Folder className="size-3.5" />
          {article.tags[0] ?? 'Uncategorized'}
        </span>
      </div>
    </article>
  );
}
