import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Calendar, Clock, Loader2, RefreshCw } from 'lucide-react';
import { useRef } from 'react';
import { MarkdownView, pagesApi, parseFrontMatter } from 'ui-sdk';
import { ArticleBottomCard } from '@/components/article-bottom-card';
import { ReadingProgress } from '@/components/reading-progress';
import { TableOfContents, useArticleHeadings, useScrollSpy } from '@/components/toc';
import { useThemeConfig } from '@/lib/theme-config';

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

function estimateReadingMinutes(md: string): number {
  const body = md.replace(/^---[\s\S]*?---\s*/, '');
  const words = body.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function TagPill({ tag }: { tag: string }) {
  return (
    <Link
      to="/"
      search={{ tag }}
      className="inline-flex items-center rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-primary-foreground no-underline transition-colors hover:bg-primary/80"
    >
      {tag}
    </Link>
  );
}

function ArticleDetailPage() {
  const { slug } = Route.useParams();
  const { articleBottomHtml } = useThemeConfig();
  const contentRef = useRef<HTMLDivElement>(null);

  const article = useQuery({
    queryKey: ['page', slug],
    queryFn: () => pagesApi.get({ slug }),
    staleTime: 60_000,
  });

  const ready = article.data !== undefined && article.data !== null;
  const headings = useArticleHeadings(contentRef, ready);
  const activeId = useScrollSpy(headings);

  if (article.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (article.isError || !article.data) {
    return (
      <div className="py-16 text-center">
        <h1 className="mb-4 font-heading text-2xl font-bold text-foreground">Article Not Found</h1>
        <p className="mb-6 text-muted-foreground">
          The article you're looking for doesn't exist or isn't published.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to home
        </Link>
      </div>
    );
  }

  const page = article.data;
  const tags = page.tags ?? [];
  const { data: frontMatter } = parseFrontMatter(page.content_md);
  const cover =
    typeof frontMatter.cover === 'string' && frontMatter.cover !== '' ? frontMatter.cover : null;
  const readingMinutes = estimateReadingMinutes(page.content_md);

  return (
    <div className="mx-auto w-full max-w-8xl">
      <ReadingProgress />
      <div className="mx-auto grid max-w-6xl gap-8 xl:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="min-w-0 space-y-8">
          <article className="glass-control glass-control-read overflow-hidden rounded-2xl">
            {cover !== null && (
              <div className="relative aspect-[21/9] w-full overflow-hidden bg-muted">
                <img src={cover} alt="" className="absolute inset-0 size-full object-cover" />
              </div>
            )}

            <div className="px-6 py-8 sm:px-10 sm:py-10">
              <Link
                to="/"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="size-4" />
                Back to home
              </Link>

              <header className="mt-6 mb-8 space-y-4">
                <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight text-foreground sm:text-4xl">
                  {page.title}
                </h1>

                <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                  {page.created_at && (
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="size-3.5" />
                      {formatDate(page.created_at)}
                    </span>
                  )}
                  {page.updated_at && page.updated_at !== page.created_at && (
                    <span className="inline-flex items-center gap-1.5" title="Last updated">
                      <RefreshCw className="size-3.5" />
                      Updated {formatDate(page.updated_at)}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" />
                    {readingMinutes} min read
                  </span>
                  {page.created_by_name && <span>by {page.created_by_name}</span>}
                </div>

                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 xl:hidden">
                    {tags.map(tag => (
                      <TagPill key={tag} tag={tag} />
                    ))}
                  </div>
                )}
              </header>

              <div ref={contentRef}>
                <MarkdownView
                  content={page.content_md}
                  className="prose max-w-none text-[0.95rem] leading-7"
                />
              </div>
            </div>
          </article>

          <ArticleBottomCard key={slug} html={articleBottomHtml} />
        </div>

        <aside className="mt-12 hidden xl:block">
          <div className="sticky top-8 space-y-6">
            <TableOfContents items={headings} activeId={activeId} label="On this page" />
            {tags.length > 0 && (
              <section aria-label="Tags" className="text-sm">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Tags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map(tag => (
                    <TagPill key={tag} tag={tag} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
