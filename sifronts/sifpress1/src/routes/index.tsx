import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { ArticleList } from '@/components/article-list';
import { ArticleCard, type ArticleCardData } from '@/components/article-card';
import { pagesApi } from 'ui-sdk';

interface HomeSearch {
  tag?: string;
  q?: string;
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    tag: typeof search.tag === 'string' ? search.tag : undefined,
    q: typeof search.q === 'string' ? search.q : undefined,
  }),
  component: HomePage,
});

function HomePage() {
  const { tag, q } = Route.useSearch();

  const articles = useQuery({
    queryKey: ['pages', 'published', tag],
    queryFn: () => pagesApi.list({ status: 'published', per_page: 50, tag }),
    staleTime: 60_000,
    enabled: !q,
  });

  const search = useQuery({
    queryKey: ['pages', 'search', q],
    queryFn: () => pagesApi.search(q ?? ''),
    staleTime: 60_000,
    enabled: Boolean(q),
  });

  let content: ReactNode;

  if (q) {
    const results = search.data?.items ?? [];

    content = (
      <div className="flex flex-col gap-6">
        <h2 className="font-serif text-lg text-muted-foreground">
          Search results for “{q}” ({results.length})
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
          <div className="flex flex-col gap-8">
            {results.map(result => {
              const data: ArticleCardData = {
                slug: result.slug,
                title: result.title,
                excerpt: result.excerpt || '…',
                tags: [],
                updated_at: result.updated_at,
              };

              return <ArticleCard key={result.id} article={data} />;
            })}
          </div>
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
            <a href="/" className="underline hover:text-foreground">
              clear
            </a>
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
          <ArticleList articles={articles.data?.items ?? []} />
        )}
      </div>
    );
  }

  return content;
}
