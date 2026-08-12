import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Calendar, Clock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { usePageTitle } from '@/hooks/use-page-title'
import { fetchArticles, type ArticleMeta } from '@/lib/articles'

function formatDate(iso: string, locale: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function readingMinutes(excerpt: string): number {
  return Math.max(1, Math.round(excerpt.split(/\s+/).length / 50))
}

function ArticleCard({ article, locale }: { article: ArticleMeta; locale: string }) {
  const { t } = useTranslation()

  return (
    <article className="glass-control group flex flex-col overflow-hidden rounded-2xl transition-shadow hover:shadow-lg">
      <Link
        to="/article/$slug"
        params={{ slug: article.slug }}
        className="block aspect-[16/9] overflow-hidden bg-muted"
      >
        <img
          src={article.cover}
          alt=""
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-6">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            {formatDate(article.date, locale)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {t('article.reading', { min: readingMinutes(article.excerpt) })}
          </span>
        </div>
        <h2 className="font-heading text-xl leading-snug font-semibold tracking-tight">
          <Link
            to="/article/$slug"
            params={{ slug: article.slug }}
            className="transition-colors hover:text-muted-foreground"
          >
            {article.title}
          </Link>
        </h2>
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {article.excerpt}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <div className="flex flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                {tag}
              </Badge>
            ))}
          </div>
          <Button asChild size="sm" variant="ghost" className="shrink-0">
            <Link to="/article/$slug" params={{ slug: article.slug }}>
              {t('article.readMore')}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
  )
}

export function ArticleIndexPage() {
  const { t, i18n } = useTranslation()

  usePageTitle(t('article.indexTitle'))

  const { data: articles, isLoading } = useQuery({
    queryKey: ['articles'],
    queryFn: fetchArticles,
  })

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <header className="space-y-2">
        <Badge>{t('article.badge')}</Badge>
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t('article.indexTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('article.indexDescription')}
        </p>
      </header>

      {isLoading || articles === undefined ? (
        <div className="space-y-6" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div
              key={i}
              className="glass-control animate-pulse rounded-2xl"
            >
              <div className="aspect-[16/9] bg-muted" />
              <div className="space-y-3 p-6">
                <div className="h-3 w-1/3 rounded bg-muted" />
                <div className="h-5 w-3/4 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-3 w-5/6 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} locale={i18n.language} />
          ))}
        </div>
      )}
    </div>
  )
}
