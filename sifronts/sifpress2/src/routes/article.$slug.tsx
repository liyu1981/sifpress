import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Clock, Pencil, RefreshCw } from 'lucide-react';
import { useRef } from 'react';
import { MarkdownView, moduleUrl, readPreviewBuffer } from 'ui-sdk';
import { Cover } from '@/components/cover';
import { SectionLink } from '@/components/kicker';
import { RailItem } from '@/components/story-card';
import { ReadingProgress } from '@/components/reading-progress';
import { RawHtml } from '@/components/raw-html';
import { ShareLinks } from '@/components/share-links';
import { EmptyBlock, LoadingBlock } from '@/components/states';
import { PreviewBanner, type PreviewMode } from '@/components/preview-banner';
import { TableOfContents, useArticleHeadings, useScrollSpy } from '@/components/toc';
import { formatDate } from '@/lib/format';
import { useArticle, useLatestStories } from '@/lib/stories';
import { useResolvedTheme } from '@/lib/theme';
import { kv, useCopy, useThemeConfig } from '@/lib/theme-config';
import { usePageMeta } from 'ui-sdk';

export const Route = createFileRoute('/article/$slug')({
  component: ArticlePageRoute,
});

function adminEditorUrl(slug: string): string {
  return moduleUrl(`sifpress/admin/editor/${encodeURIComponent(slug)}`);
}

function Byline({ article }: { article: ReturnType<typeof useArticle>['data'] }) {
  if (article === undefined) {
    return null;
  }

  const updated =
    article.updatedAt !== article.createdAt ? formatDate(article.updatedAt, 'short') : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      {article.author !== '' && <span className="font-semibold text-ink">{article.author}</span>}
      <span className="meta-line">{formatDate(article.createdAt, 'long')}</span>
      <span className="meta-line inline-flex items-center gap-1.5">
        <Clock className="size-3.5" />
        {article.readingMinutes} min read
      </span>
      {updated !== null && (
        <span className="meta-line inline-flex items-center gap-1.5">
          <RefreshCw className="size-3" />
          Updated {updated}
        </span>
      )}
    </div>
  );
}

function ArticlePageRoute() {
  const { slug } = Route.useParams();
  const resolvedTheme = useResolvedTheme();
  const copy = useCopy();
  const { articleBottomHtml } = useThemeConfig();
  const contentRef = useRef<HTMLDivElement>(null);
  const article = useArticle(slug);
  const previewBuffer = readPreviewBuffer(slug);
  const unsavedPreview = previewBuffer !== null;
  const latest = useLatestStories();

  const ready = article.data !== undefined;
  const headings = useArticleHeadings(contentRef, ready);
  const activeId = useScrollSpy(headings);

  const page = article.data;

  usePageMeta(
    page === undefined
      ? null
      : {
          title: page.seo?.title || page.title,
          description: page.seo?.description || page.dek || page.excerpt,
          image: page.seo?.og_image || page.cover || undefined,
          canonical: page.seo?.canonical,
          /*
           * A preview — and a draft — must stay out of the index. Without
           * this, usePageMeta would clear the server-rendered noindex for a
           * draft (its front matter does not say noindex) and mark an unsaved
           * preview of a published story as indexable.
           */
          noindex: page.seo?.noindex === true || page.status === 'draft' || unsavedPreview,
          type: 'article',
        },
  );

  if (article.isLoading) {
    return <LoadingBlock label="" />;
  }

  if (article.isError || !page) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-24 text-center sm:px-6">
        <h1 {...kv('copy.articleNotFound')} className="headline text-5xl">
          {copy('articleNotFound')}
        </h1>
        <p className="dek mt-4">This story doesn’t exist, or it hasn’t been published yet.</p>
        <Link
          {...kv('copy.backHome')}
          to="/"
          className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-brand transition-colors hover:text-brand-ink"
        >
          <ArrowLeft className="size-4" />
          {copy('backHome')}
        </Link>
      </div>
    );
  }

  const previewMode: PreviewMode | null = unsavedPreview
    ? 'unsaved'
    : page.status === 'draft'
      ? 'draft'
      : null;

  const related = (latest.data ?? [])
    .filter(
      story => story.slug !== page.slug && story.section !== null && story.section === page.section,
    )
    .slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
      <ReadingProgress />

      {previewMode !== null && (
        <PreviewBanner
          mode={previewMode}
          editHref={adminEditorUrl(unsavedPreview ? previewBuffer.edit_slug : page.slug)}
        />
      )}

      <nav aria-label="Breadcrumb" className="mb-8 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm text-ink-soft transition-colors hover:text-ink"
        >
          <ArrowLeft className="size-4" />
          Front page
        </Link>

        {page.canEdit && (
          <a
            href={adminEditorUrl(page.slug)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint transition-colors hover:text-ink"
          >
            <Pencil className="size-3.5" />
            Edit
          </a>
        )}
      </nav>

      <article>
        <header className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-center gap-3">
            {page.section !== null ? (
              <SectionLink section={page.section} className="kicker" />
            ) : (
              <p className="kicker kicker-muted">Dispatch</p>
            )}
          </div>

          <h1 className="headline mt-4 text-4xl sm:text-5xl lg:text-[3.6rem]">{page.title}</h1>

          {page.dek !== '' && <p className="dek mt-5 text-xl sm:text-2xl">{page.dek}</p>}

          <div className="mt-6 flex flex-col gap-4 border-y border-rule py-4 sm:flex-row sm:items-center sm:justify-between">
            <Byline article={page} />
            <ShareLinks title={page.title} />
          </div>
        </header>

        {page.cover !== null && (
          <div className="mt-10">
            <Cover src={page.cover} alt={page.title} ratio="21/9" caption={page.caption} priority />
          </div>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-14">
          <div className="min-w-0">
            <div ref={contentRef}>
              <MarkdownView
                content={page.content_md}
                theme={resolvedTheme}
                className="prose-editorial"
              />
            </div>

            {page.tags.length > 0 && (
              <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-rule pt-6">
                {page.tags.map(tag => (
                  <Link
                    key={tag}
                    to="/section/$section"
                    params={{ section: tag }}
                    className="rounded-[3px] border border-rule px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors hover:border-ink hover:text-ink"
                  >
                    {tag}
                  </Link>
                ))}
              </div>
            )}

            {articleBottomHtml.trim() !== '' && (
              <section
                {...kv('article.bottom')}
                id="comments"
                key={slug}
                aria-label="Comments"
                className="mt-12 scroll-mt-24 border-t border-rule pt-6"
              >
                <RawHtml html={articleBottomHtml} />
              </section>
            )}
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-8">
              <TableOfContents items={headings} activeId={activeId} label={copy('onThisPage')} />

              <div>
                <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
                  Share
                </p>
                <div className="mt-3">
                  <ShareLinks title={page.title} />
                </div>
              </div>
            </div>
          </aside>
        </div>
      </article>

      {related.length > 0 && (
        <section aria-label={copy('moreIn', { section: page.section ?? '' })} className="mt-20">
          <header className="flex items-baseline justify-between gap-4 border-b border-rule-strong pb-3">
            <h2 {...kv('copy.moreIn')} className="headline-tight text-2xl">
              {copy('moreIn', { section: page.section ?? '' })}
            </h2>
            {page.section !== null && (
              <Link
                to="/section/$section"
                params={{ section: page.section }}
                className="meta-line transition-colors hover:text-ink"
              >
                View all →
              </Link>
            )}
          </header>

          <div className="grid gap-x-8 gap-y-6 pt-4 sm:grid-cols-3">
            {related.map(story => (
              <RailItem key={story.id} story={story} showCover />
            ))}
          </div>
        </section>
      )}

      {related.length === 0 && !latest.isLoading && (
        <EmptyBlock>
          <Link to="/archive" className="story-link decoration-none">
            Browse the archive
          </Link>
        </EmptyBlock>
      )}
    </div>
  );
}
