import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { ArticleDetailPage } from '@/pages/article-detail'
import { Badge } from '@/components/ui/badge'
import { pagesApi } from '@/lib/pages'
import { usePageTitle } from '@/hooks/use-page-title'

export function HomePage() {
  const { t } = useTranslation()

  usePageTitle(t('home.title'))

  const latest = useQuery({
    queryKey: ['pages'],
    queryFn: () => pagesApi.list({ status: 'published', per_page: 1 }),
  })

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
    )
  }

  const first = latest.data.items[0]

  if (first === undefined) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 py-16 text-center">
        <Badge variant="outline">{t('article.badge')}</Badge>
        <h1 className="font-heading text-2xl font-bold">{t('home.emptyTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('home.emptyDescription')}</p>
      </div>
    )
  }

  return <ArticleDetailPage slug={first.slug} />
}
