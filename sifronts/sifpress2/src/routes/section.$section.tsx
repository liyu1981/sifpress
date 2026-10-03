import { Link, createFileRoute } from '@tanstack/react-router';
import { Masthead } from '@/components/masthead';
import { NewsletterBand } from '@/components/newsletter';
import { Pagination } from '@/components/pagination';
import { RailItem, StoryCard } from '@/components/story-card';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/states';
import { useSectionStories } from '@/lib/stories';
import { useCopy } from '@/lib/theme-config';

interface SectionSearch {
  page?: number;
}

function parsePage(value: unknown): number | undefined {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const Route = createFileRoute('/section/$section')({
  validateSearch: (search: Record<string, unknown>): SectionSearch => ({
    page: parsePage(search.page),
  }),
  component: SectionPage,
});

function SectionPage() {
  const { section } = Route.useParams();
  const { page } = Route.useSearch();
  const copy = useCopy();
  const current = page ?? 1;
  const query = useSectionStories(section, current);

  if (query.isLoading) {
    return (
      <div className="mx-auto w-full max-w-8xl px-4 py-10 sm:px-6">
        <LoadingBlock />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-8xl px-4 py-10 sm:px-6">
        <ErrorBlock>This section could not be loaded.</ErrorBlock>
      </div>
    );
  }

  const items = query.data?.items ?? [];
  const [lead, ...rest] = items;
  const pageCount = Math.max(1, Math.ceil((query.data?.total ?? items.length) / 12));

  return (
    <div className="mx-auto w-full max-w-8xl px-4 sm:px-6">
      <Masthead />

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-rule-strong py-8">
        <div>
          <p className="kicker">Section</p>
          <h1 className="headline mt-2 text-5xl sm:text-6xl">{section}</h1>
        </div>
        <Link to="/archive" className="meta-line transition-colors hover:text-ink">
          ← All stories
        </Link>
      </header>

      {items.length === 0 ? (
        <EmptyBlock>{copy('emptyState')}</EmptyBlock>
      ) : (
        <>
          <div className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-12">
            <div>
              <StoryCard story={lead} variant="lead" showDek coverPriority />
            </div>

            <aside
              aria-label={copy('latestStories')}
              className="lg:border-l lg:border-rule lg:pl-8"
            >
              <h2 className="border-b border-rule-strong pb-3 text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
                {copy('moreIn', { section })}
              </h2>
              {rest.map(story => (
                <RailItem key={story.id} story={story} />
              ))}
            </aside>
          </div>

          {rest.length > 6 && (
            <div className="grid gap-x-8 gap-y-10 border-t border-rule-strong pt-8 sm:grid-cols-2 lg:grid-cols-3">
              {rest.slice(6).map(story => (
                <StoryCard key={story.id} story={story} variant="standard" />
              ))}
            </div>
          )}

          <div className="mt-12">
            <Pagination
              page={current}
              pageCount={pageCount}
              buildHref={next => ({
                to: '/section/$section',
                params: { section },
                search: next > 1 ? { page: next } : {},
              })}
            />
          </div>
        </>
      )}

      <NewsletterBand />
    </div>
  );
}
