import { useRef } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Calendar, Clock, FilePenLine, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DeletePageMenu } from '@/components/delete-page-menu'
import { Markdown } from '@/components/markdown/markdown'
import {
  TableOfContents,
  useArticleHeadings,
  useScrollSpy,
} from '@/components/markdown/toc'
import { ReadingProgress } from '@/components/reading-progress'
import { usePageTitle } from '@/hooks/use-page-title'
import { useAuth } from '@/lib/auth'
import { pagesApi } from '@/lib/pages'
import { frontMatterString, parseFrontMatter } from '@/lib/front-matter'
import { estimateReadingMinutes, formatDate } from '@/lib/format'

function ArticleSkeleton() {
  return (
    <div className="glass-control animate-pulse rounded-2xl">
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
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const contentRef = useRef<HTMLDivElement>(null)

  const article = useQuery({
    queryKey: ['page', slug],
    queryFn: () => pagesApi.get({ slug }),
  })

  usePageTitle(article.data?.title ?? t('article.loadingTitle'))

  const headings = useArticleHeadings(
    contentRef,
    article.data !== undefined && article.data !== null,
  )
  const activeId = useScrollSpy(headings)

  const prevNext = useQuery({
    queryKey: ['pages'],
    queryFn: () => pagesApi.list({ per_page: 50 }),
  })

  const items = prevNext.data?.items ?? []
  const index = article.data ? items.findIndex((a) => a.slug === article.data?.slug) : -1
  const newer = index > 0 ? items[index - 1] : null
  const older = index >= 0 && index < items.length - 1 ? items[index + 1] : null

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

  const page = article.data
  const cover = frontMatterString(parseFrontMatter(page.content_md).data, 'cover')

  return (
    <div className="mx-auto w-full max-w-5xl">
      <ReadingProgress />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <article className="glass-control overflow-hidden rounded-2xl">
          {cover !== null && (
            <div className="aspect-[21/9] overflow-hidden bg-muted">
              <img src={cover} alt="" className="size-full object-cover" />
            </div>
          )}
          <div className="px-6 py-8 sm:px-10 sm:py-10">
            <header className="mb-8 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {page.status === 'draft' && (
                  <Badge variant="outline">{t('article.draft')}</Badge>
                )}
                {(page.can_edit ||
                  (user !== null && (isAdmin || page.created_by === user.id))) && (
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    {page.can_edit && (
                      <Button asChild variant="glass" size="xs">
                        <Link to="/editor/$slug" params={{ slug: page.slug }}>
                          <FilePenLine />
                          {t('article.edit')}
                        </Link>
                      </Button>
                    )}
                    {user !== null && (isAdmin || page.created_by === user.id) && (
                      <DeletePageMenu
                        pageId={page.id}
                        title={page.title}
                        onDeleted={() => navigate({ to: '/article' })}
                      >
                        <Button variant="glass" size="xs" className="text-destructive">
                          <Trash2 />
                          {t('editor.delete')}
                        </Button>
                      </DeletePageMenu>
                    )}
                  </div>
                )}
              </div>
              <h1 className="font-heading text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
                {page.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5" />
                  {formatDate(page.updated_at.slice(0, 10), i18n.language)}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  {t('article.reading', {
                    min: estimateReadingMinutes(page.content_md),
                  })}
                </span>
                {page.created_by_name !== '' && (
                  <span>{page.created_by_name}</span>
                )}
              </div>
            </header>

            <div ref={contentRef}>
              <Markdown
                content={page.content_md}
                className="prose max-w-none text-[0.95rem] leading-7"
              />
            </div>
          </div>
        </article>

        <aside className="mt-12 hidden lg:block">
          <div className="sticky top-24 space-y-6">
            <TableOfContents
              items={headings}
              activeId={activeId}
              label={t('article.toc')}
            />
            {page.tags.length > 0 && (
              <section aria-label={t('article.tagsTitle')} className="text-sm">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {t('article.tagsTitle')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {page.tags.map((tag) => (
                    <Badge key={tag}>
                      <Link to="/article" search={{ tag }} className="no-underline">
                        {tag}
                      </Link>
                    </Badge>
                  ))}
                </div>
              </section>
            )}
          </div>
        </aside>
      </div>

      <nav className="mt-8 grid gap-4 sm:grid-cols-2">
        {newer ? (
          <Link
            to="/article/$slug"
            params={{ slug: newer.slug }}
            className="glass-control group flex flex-col gap-1 rounded-2xl p-5 transition-shadow hover:shadow-lg"
          >
            <span className="text-xs text-muted-foreground">
              {t('article.newer')}
            </span>
            <span className="font-medium group-hover:text-muted-foreground">
              {newer.title}
            </span>
          </Link>
        ) : (
          <div />
        )}
        {older ? (
          <Link
            to="/article/$slug"
            params={{ slug: older.slug }}
            className="glass-control group flex flex-col items-end gap-1 rounded-2xl p-5 text-right transition-shadow hover:shadow-lg"
          >
            <span className="text-xs text-muted-foreground">
              {t('article.older')}
            </span>
            <span className="font-medium group-hover:text-muted-foreground">
              {older.title}
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
