import { Link, createFileRoute } from '@tanstack/react-router';
import { Masthead } from '@/components/masthead';
import { NewsletterBand } from '@/components/newsletter';
import { Pagination } from '@/components/pagination';
import { StoryCard } from '@/components/story-card';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/states';
import { useSectionStories } from '@/lib/stories';
import { kv, useCopy } from '@/lib/theme-config';

interface ArchiveSearch {
  page?: number;
}

function parsePage(value: unknown): number | undefined {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const Route = createFileRoute('/archive')({
  validateSearch: (search: Record<string, unknown>): ArchiveSearch => ({
    page: parsePage(search.page),
  }),
  component: ArchivePage,
});

function ArchivePage() {
  const { page } = Route.useSearch();
  const copy = useCopy();
  const current = page ?? 1;
  const archive = useSectionStories('', current);

  if (archive.isLoading) {
    return (
      <div className="mx-auto w-full max-w-8xl px-4 py-10 sm:px-6">
        <LoadingBlock />
      </div>
    );
  }

  if (archive.isError) {
    return (
      <div className="mx-auto w-full max-w-8xl px-4 py-10 sm:px-6">
        <ErrorBlock>The archive could not be loaded.</ErrorBlock>
      </div>
    );
  }

  const items = archive.data?.items ?? [];
  const pageCount = Math.max(1, Math.ceil((archive.data?.total ?? items.length) / 12));

  return (
    <div className="mx-auto w-full max-w-8xl px-4 sm:px-6">
      <Masthead />

      <header className="flex flex-wrap items-end justify-between gap-3 py-8">
        <h1 className="headline text-5xl sm:text-6xl">Archive</h1>
        <Link to="/" className="meta-line transition-colors hover:text-ink">
          ← Front page
        </Link>
      </header>

      {items.length === 0 ? (
        <EmptyBlock inspectKey={kv('copy.emptyState')}>{copy('emptyState')}</EmptyBlock>
      ) : (
        <>
          <div className="grid gap-x-8 gap-y-10 border-t border-rule-strong pt-8 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(story => (
              <StoryCard key={story.id} story={story} variant="standard" />
            ))}
          </div>

          <div className="mt-12">
            <Pagination
              page={current}
              pageCount={pageCount}
              buildHref={next => ({ to: '/archive', search: next > 1 ? { page: next } : {} })}
            />
          </div>
        </>
      )}

      <NewsletterBand />
    </div>
  );
}
