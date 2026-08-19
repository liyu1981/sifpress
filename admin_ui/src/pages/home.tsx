import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { usePageMeta } from '@/hooks/use-page-meta';
import { DEMO_PAGE_SLUG, pagesApi, settingsApi } from 'ui-sdk';
import { ArticleDetailPage } from '@/pages/article-detail';
import { log } from '@/lib/logger';

export function HomePage() {
  const { t } = useTranslation();

  const settings = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
  });

  usePageMeta({
    title: settings.data?.site_name ?? 'Sifpress',
    description: settings.data?.site_description ?? '',
    siteName: settings.data?.site_name ?? undefined,
  });

  const latest = useQuery({
    queryKey: ['pages', { status: 'published', per_page: 1 }],
    queryFn: () => pagesApi.list({ status: 'published', per_page: 1 }),
  });

  if (latest.isLoading || latest.data === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div className="glass-control animate-pulse rounded-2xl">
          <div className="space-y-4 p-8 sm:p-10">
            <div className="h-3 w-1/4 rounded bg-muted" />
            <div className="h-8 w-3/4 rounded bg-muted" />
            <div className="h-3 w-1/3 rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
            <div className="h-3 w-full rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  const first = latest.data.items[0];

  if (first === undefined) {
    return <ArticleDetailPage slug={DEMO_PAGE_SLUG} />;
  }

  log('[HOME] rendering ArticleDetailPage slug=%s', first.slug);
  return <ArticleDetailPage slug={first.slug} />;
}
