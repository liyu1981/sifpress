import { useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Calendar, Clock } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/markdown/markdown'
import {
  TableOfContents,
  useArticleHeadings,
  useScrollSpy,
} from '@/components/markdown/toc'
import { ReadingProgress } from '@/components/reading-progress'
import { usePageTitle } from '@/hooks/use-page-title'
import { fetchArticle, fetchArticles } from '@/lib/articles'
import { estimateReadingMinutes, formatDate } from '@/lib/format'

function ArticleSkeleton() {
  return (
    <div className="glass-control animate-pulse rounded-2xl">
      <div className="aspect-[21/9] bg-muted" />
      <div className="space-y-4 p-8 sm:p-10">
        <div className="h-3 w-1/4 rounded bg-muted" />
        <div className="h-8 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-full rounded bg-muted" />
        <div className="h-3 w-2/3 rounded bg-muted" />
      </div>
    </div>
  )
}

export function ArticleDetailPage({ slug }: { slug: string }) {
  const { t, i18n } = useTranslation()
  const contentRef = useRef<HTMLDivElement>(null)

  const article = useQuery({
    queryKey: ['article', slug],
    queryFn: () => fetchArticle(slug),
  })

  usePageTitle(article.data?.title ?? t('article.loadingTitle'))

  const headings = useArticleHeadings(
    contentRef,
    article.data !== undefined && article.data !== null,
  )
  const activeId = useScrollSpy(headings)

  const prevNext = useQuery({
    queryKey: ['articles'],
    queryFn: fetchArticles,
  })

  const items = prevNext.data ?? []
  const index = article.data ? items.findIndex((a) => a.slug === article.data?.slug) : -1
  const prev = index > 0 ? items[index - 1] : null
  const next = index >= 0 && index < items.length - 1 ? items[index + 1] : null

  if (article.isLoading || article.data === undefined) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <ReadingProgress />
        <ArticleSkeleton />
      </div>
    )
  }

  if (article.data === null) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4 text-center">
        <Badge variant="outline">{t('article.notFoundBadge')}</Badge>
        <h1 className="font-heading text-2xl font-bold">
          {t('article.notFoundTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('article.notFoundDescription')}
        </p>
        <Button asChild variant="glass" size="sm">
          <Link to="/article">
            <ArrowLeft className="size-3.5" />
            {t('article.backToIndex')}
          </Link>
        </Button>
      </div>
    )
  }

  const { title, date, tags, excerpt, cover, content } = article.data

  return (
    <div className="mx-auto w-full max-w-5xl">
      <ReadingProgress />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="glass-control overflow-hidden rounded-2xl">
          <div className="aspect-[21/9] overflow-hidden bg-muted">
            <img src={cover} alt="" className="size-full object-cover" />
          </div>
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <header className="mb-8 space-y-4">
              <Badge>{t('article.badge')}</Badge>
              <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
                {title}
              </h1>
              <p className="text-base text-muted-foreground">{excerpt}</p>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {formatDate(date, i18n.language)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {t('article.reading', { min: estimateReadingMinutes(content) })}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            </header>

            <div ref={contentRef}>
              <Markdown
                content={content}
                className="prose max-w-none text-[0.95rem] leading-7"
              />
            </div>
          </div>
        </article>

        <aside className="mt-12 hidden lg:block">
          <div className="sticky top-24">
            <TableOfContents
              items={headings}
              activeId={activeId}
              label={t('article.toc')}
            />
          </div>
        </aside>
      </div>

      <nav className="mt-8 grid gap-4 sm:grid-cols-2">
        {prev ? (
          <Link
            to="/article/$slug"
            params={{ slug: prev.slug }}
            className="glass-control group flex flex-col gap-1 rounded-2xl p-5 transition-shadow hover:shadow-lg"
          >
            <span className="text-xs text-muted-foreground">
              {t('article.prev')}
            </span>
            <span className="font-medium group-hover:text-muted-foreground">
              {prev.title}
            </span>
          </Link>
        ) : (
          <div />
        )}
        {next ? (
          <Link
            to="/article/$slug"
            params={{ slug: next.slug }}
            className="glass-control group flex flex-col items-end gap-1 rounded-2xl p-5 text-right transition-shadow hover:shadow-lg"
          >
            <span className="text-xs text-muted-foreground">
              {t('article.next')}
            </span>
            <span className="font-medium group-hover:text-muted-foreground">
              {next.title}
            </span>
          </Link>
        ) : null}
      </nav>

      <div className="mt-8 flex justify-center">
        <Button asChild variant="glass" size="sm">
          <Link to="/article">
            <ArrowLeft className="size-3.5" />
            {t('article.backToIndex')}
          </Link>
        </Button>
      </div>
    </div>
  )
}
