import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArticleList } from '@/components/article-list';
import { ArticleCard, type ArticleCardData } from '@/components/article-card';
import { pagesApi } from 'ui-sdk';

const SIFRONT_PER_PAGE = 10;

interface HomeSearch {
  tag?: string;
  q?: string;
  page?: number;
}

function parsePage(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    tag: typeof search.tag === 'string' ? search.tag : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
    page: parsePage(search.page),
  }),
  component: HomePage,
});

function Pager({
  page,
  total,
  search,
}: {
  page: number;
  total: number;
  search: { tag?: string; q?: string };
}) {
  const pages = Math.max(1, Math.ceil(total / SIFRONT_PER_PAGE));

  if (pages <= 1) {
    return null;
  }

  const linkSearch = (next: number) => ({
    ...(search.tag !== undefined ? { tag: search.tag } : {}),
    ...(search.q !== undefined ? { q: search.q } : {}),
    ...(next > 1 ? { page: next } : {}),
  });

  const buttonClass =
    'glass-control rounded-lg px-4 py-2 font-serif text-sm transition-colors hover:text-muted-foreground';

  return (
    <nav className="flex items-center justify-between gap-4 pt-2">
      {page > 1 ? (
        <Link to="/" search={linkSearch(page - 1)} className={buttonClass}>
          ← Previous
        </Link>
      ) : (
        <span />
      )}
      <span className="font-serif text-sm text-muted-foreground">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link to="/" search={linkSearch(page + 1)} className={buttonClass}>
          Next →
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}

function HomePage() {
  const { tag, q, page: rawPage } = Route.useSearch();
  const page = rawPage ?? 1;

  const articles = useQuery({
    queryKey: ['pages', 'published', tag, page],
    queryFn: () =>
      pagesApi.list({
        status: 'published',
        per_page: SIFRONT_PER_PAGE,
        page,
        tag,
      }),
    staleTime: 60_000,
    enabled: !q,
  });

  const search = useQuery({
    queryKey: ['pages', 'search', q, page],
    queryFn: () => pagesApi.search(q ?? '', { page, per_page: SIFRONT_PER_PAGE }),
    staleTime: 60_000,
    enabled: Boolean(q),
  });

  let content: ReactNode;

  if (q) {
    const results = search.data?.items ?? [];

    content = (
      <div className="flex flex-col gap-6">
        <h2 className="font-serif text-lg text-muted-foreground">
          Search results for “{q}” ({search.data?.total ?? results.length})
        </h2>
        {search.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : search.isError ? (
          <div className="glass-control rounded-2xl p-8 text-center text-muted-foreground">
            <p className="font-serif text-lg">Search failed.</p>
          </div>
        ) : results.length === 0 ? (
          <div className="glass-control rounded-2xl p-8 text-center text-muted-foreground">
            <p className="font-serif text-lg">No results for “{q}”.</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-8">
              {results.map(result => {
                const data: ArticleCardData = {
                  slug: result.slug,
                  title: result.title,
                  excerpt: result.excerpt || '…',
                  tags: [],
                  created_at: result.created_at,
                  updated_at: result.updated_at,
                };

                return <ArticleCard key={result.id} article={data} />;
              })}
            </div>
            <Pager page={page} total={search.data?.total ?? results.length} search={{ q }} />
          </>
        )}
      </div>
    );
  } else {
    content = (
      <div className="flex flex-col gap-6">
        {tag && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Filtered by:</span>
            <span className="glass-control rounded-lg px-3 py-1 font-medium text-foreground">
              {tag}
            </span>
            <Link to="/" search={{}} className="underline hover:text-foreground">
              clear
            </Link>
          </div>
        )}

        {articles.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : articles.isError ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>Failed to load articles.</p>
            <p className="mt-1 text-sm">The backend may not be available.</p>
          </div>
        ) : (
          <>
            <ArticleList articles={articles.data?.items ?? []} />
            <Pager
              page={page}
              total={articles.data?.total ?? 0}
              search={tag !== undefined ? { tag } : {}}
            />
          </>
        )}
      </div>
    );
  }

  return content;
}
