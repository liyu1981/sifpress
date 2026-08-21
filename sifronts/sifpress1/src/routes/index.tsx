import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { ArticleList } from '@/components/article-list';
import { Sidebar } from '@/components/sidebar';
import { pagesApi, settingsApi, tagsApi } from 'ui-sdk';

interface HomeSearch {
  tag?: string;
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    tag: typeof search.tag === 'string' ? search.tag : undefined,
  }),
  component: HomePage,
});

function HomePage() {
  const { tag } = Route.useSearch();

  const articles = useQuery({
    queryKey: ['pages', 'published', tag],
    queryFn: () => pagesApi.list({ status: 'published', per_page: 50, tag }),
    staleTime: 60_000,
  });

  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: tagsApi.list,
    staleTime: 60_000,
  });

  const settings = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  });

  const siteName = settings.data?.site_name ?? 'Welcome';
  const siteDescription = settings.data?.site_description ?? '';

  return (
    <div className="flex flex-col gap-8">
      <section className="text-center py-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">{siteName}</h1>
        {siteDescription && (
          <p className="text-muted-foreground text-base max-w-lg mx-auto">{siteDescription}</p>
        )}
      </section>

      {tag && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Filtered by:</span>
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 font-medium text-foreground">
            {tag}
          </span>
          <a href="/" className="underline hover:text-foreground">
            clear
          </a>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        <div className="flex-1 min-w-0">
          {articles.isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : articles.isError ? (
            <div className="text-center py-16 text-muted-foreground">
              <p>Failed to load articles.</p>
              <p className="text-sm mt-1">The backend may not be available.</p>
            </div>
          ) : (
            <ArticleList articles={articles.data?.items ?? []} />
          )}
        </div>

        <div className="w-full lg:w-64 shrink-0">
          <Sidebar tags={tags.data ?? []} />
        </div>
      </div>
    </div>
  );
}
