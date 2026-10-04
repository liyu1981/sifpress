import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight } from 'lucide-react';
import type { KvAttrs } from 'ui-sdk';
import { Masthead } from '@/components/masthead';
import { NewsletterBand } from '@/components/newsletter';
import { Pagination } from '@/components/pagination';
import { RailItem, StoryCard } from '@/components/story-card';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '@/components/states';
import { SectionBlock } from '@/components/section-block';
import {
  applyFeaturedSlugs,
  groupSections,
  useLatestStories,
  useSearchStories,
} from '@/lib/stories';
import { kv, useCopy, useThemeConfig } from '@/lib/theme-config';

interface HomeSearch {
  q?: string;
  page?: number;
}

const SEARCH_PER_PAGE = 12;

function parsePage(value: unknown): number | undefined {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    q: typeof search.q === 'string' && search.q !== '' ? search.q : undefined,
    page: parsePage(search.page),
  }),
  component: HomePage,
});

function ViewAllLink({ label, inspectKey }: { label: string; inspectKey?: KvAttrs }) {
  return (
    <Link
      {...inspectKey}
      to="/archive"
      className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold tracking-[0.12em] text-brand uppercase transition-colors hover:text-brand-ink"
    >
      {label}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

function SearchResults({ query, page }: { query: string; page: number }) {
  const copy = useCopy();
  const search = useSearchStories(query, page);

  if (search.isLoading) {
    return <LoadingBlock />;
  }

  if (search.isError) {
    return <ErrorBlock>The archive could not be searched right now.</ErrorBlock>;
  }

  const items = search.data?.items ?? [];

  if (items.length === 0) {
    return (
      <EmptyBlock inspectKey={kv('copy.noResults')}>{copy('noResults', { query })}</EmptyBlock>
    );
  }

  const pageCount = Math.max(1, Math.ceil((search.data?.total ?? items.length) / SEARCH_PER_PAGE));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 {...kv('copy.searchResults')} className="headline-tight text-3xl">
          {copy('searchResults', { query })}
        </h1>
        <span className="meta-line">
          {search.data?.total ?? items.length} result
          {(search.data?.total ?? items.length) === 1 ? '' : 's'}
        </span>
      </header>

      <div className="flex flex-col">
        {items.map(story => (
          <RailItem key={story.id} story={story} />
        ))}
      </div>

      <Pagination
        page={page}
        pageCount={pageCount}
        buildHref={next => ({
          to: '/',
          search: next > 1 ? { q: query, page: next } : { q: query },
        })}
      />
    </div>
  );
}

function FrontPage() {
  const copy = useCopy();
  const { featuredSlugs, sectionTags } = useThemeConfig();
  const latest = useLatestStories();

  if (latest.isLoading) {
    return <LoadingBlock />;
  }

  if (latest.isError) {
    return (
      <ErrorBlock>The front page could not be loaded. Check the connection and retry.</ErrorBlock>
    );
  }

  const stories = applyFeaturedSlugs(latest.data ?? [], featuredSlugs);

  if (stories.length === 0) {
    return <EmptyBlock inspectKey={kv('copy.emptyState')}>{copy('emptyState')}</EmptyBlock>;
  }

  const [lead, ...rest] = stories;
  const latestRail = rest.slice(0, 5);
  const topStories = rest.slice(0, 6);
  const seen = new Set<string>([lead.slug, ...topStories.map(story => story.slug)]);
  const sections = groupSections(rest, seen, {
    only: sectionTags,
    max: sectionTags.length > 0 ? sectionTags.length : 2,
  });

  return (
    <>
      <div
        {...kv('featured.slugs')}
        className="grid gap-10 py-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-12"
      >
        <StoryCard story={lead} variant="lead" showDek coverPriority />

        <aside aria-label={copy('latestStories')} className="lg:border-l lg:border-rule lg:pl-8">
          <div className="flex items-baseline justify-between gap-3 border-b border-rule-strong pb-3">
            <h2
              {...kv('copy.latestStories')}
              className="text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase"
            >
              {copy('latestStories')}
            </h2>
            <ViewAllLink label={copy('viewAll')} inspectKey={kv('copy.viewAll')} />
          </div>

          <div>
            {latestRail.map(story => (
              <RailItem key={story.id} story={story} />
            ))}
          </div>
        </aside>
      </div>

      {topStories.length > 0 && (
        <section aria-label={copy('topStories')}>
          <header className="flex items-baseline justify-between gap-4 border-b border-rule-strong pb-3">
            <h2 {...kv('copy.topStories')} className="headline-tight text-2xl">
              {copy('topStories')}
            </h2>
            <ViewAllLink label={copy('viewAll')} inspectKey={kv('copy.viewAll')} />
          </header>

          <div className="grid gap-x-8 gap-y-10 pt-8 sm:grid-cols-2 lg:grid-cols-3">
            {topStories.map(story => (
              <StoryCard key={story.id} story={story} variant="standard" />
            ))}
          </div>
        </section>
      )}

      {sections.length > 0 && (
        <div {...kv('home.sectionTags')} className="mt-14 grid gap-x-12 gap-y-10 lg:grid-cols-2">
          {sections.map(block => (
            <SectionBlock key={block.name} block={block} />
          ))}
        </div>
      )}

      <NewsletterBand />
    </>
  );
}

function HomePage() {
  const { q, page } = Route.useSearch();

  return (
    <div className="mx-auto w-full max-w-8xl px-4 sm:px-6">
      <Masthead />

      {q !== undefined ? (
        <div className="py-8">
          <SearchResults query={q} page={page ?? 1} />
        </div>
      ) : (
        <div className="pb-8">
          <FrontPage />
        </div>
      )}
    </div>
  );
}
