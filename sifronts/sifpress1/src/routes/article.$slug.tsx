import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Calendar, Loader2, Tag } from 'lucide-react';
import { pagesApi } from 'ui-sdk';

export const Route = createFileRoute('/article/$slug')({
  component: ArticleDetailPage,
});

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

function ArticleDetailPage() {
  const { slug } = Route.useParams();

  const article = useQuery({
    queryKey: ['page', slug],
    queryFn: () => pagesApi.get({ slug }),
    staleTime: 60_000,
  });

  if (article.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (article.isError || !article.data) {
    return (
      <div className="text-center py-16">
        <h1 className="text-2xl font-bold text-foreground mb-4">Article Not Found</h1>
        <p className="text-muted-foreground mb-6">
          The article you're looking for doesn't exist or isn't published.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
      </div>
    );
  }

  const page = article.data;
  const tags = page.tags ?? [];
  const content = page.content_md;

  return (
    <article className="max-w-3xl mx-auto">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
      >
        <ArrowLeft className="size-4" />
        Back to home
      </Link>

      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-4 leading-snug">
          {page.title}
        </h1>

        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {page.updated_at && (
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-4" />
              {formatDate(page.updated_at)}
            </span>
          )}

          {tags.length > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <Tag className="size-4" />
              {tags.join(', ')}
            </span>
          )}

          {page.created_by_name && <span>by {page.created_by_name}</span>}
        </div>
      </header>

      <div
        className="prose prose-lg max-w-none"
        dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content) }}
      />
    </article>
  );
}

function simpleMarkdownToHtml(md: string): string {
  const withoutFrontMatter = md.replace(/^---[\s\S]*?---\s*/, '');

  return withoutFrontMatter
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, match => `<ul>${match}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hulo])((?!^$).+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '')
    .replace(/^<p>(<[hulo])/gm, '$1')
    .replace(/(<\/[hulo][^>]*>)<\/p>/g, '$1');
}
