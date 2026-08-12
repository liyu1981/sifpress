import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, Calendar, Clock, FilePenLine, Search } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { pagesApi, tagsApi } from '@/lib/pages'
import type { PageListItem, SearchResult } from '@/lib/pages'
import { usePageTitle } from '@/hooks/use-page-title'
import { frontMatterString, parseFrontMatter } from '@/lib/front-matter'
import { estimateReadingMinutes, excerptFromMarkdown, formatDate } from '@/lib/format'

function SearchCard({ result, locale }: { result: SearchResult; locale: string }) {
  const { t } = useTranslation()

  return (
    <article className="glass-control group flex flex-col gap-3 rounded-2xl p-6 transition-shadow hover:shadow-lg">
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Calendar className="size-3.5" />
          {formatDate(result.updated_at.slice(0, 10), locale)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {t('article.reading', { min: estimateReadingMinutes(result.excerpt) })}
        </span>
        {result.status === 'draft' && <Badge variant="outline">{t('article.draft')}</Badge>}
      </div>
      <h2 className="font-heading text-xl leading-snug font-semibold tracking-tight">
        <Link
          to="/article/$slug"
          params={{ slug: result.slug }}
          className="transition-colors hover:text-muted-foreground"
        >
          {result.title}
        </Link>
      </h2>
      <p className="line-clamp-2 text-sm text-muted-foreground">
        {result.excerpt.replace(/<\/?mark>/g, '')}
      </p>
      <Button asChild size="sm" variant="ghost" className="mt-auto self-start">
        <Link to="/article/$slug" params={{ slug: result.slug }}>
          {t('article.readMore')}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </Button>
    </article>
  )
}

function ArticleCard({ article, locale }: { article: PageListItem; locale: string }) {
  const { t } = useTranslation()
  const frontMatter = parseFrontMatter(article.content_md)
  const cover = frontMatterString(frontMatter.data, 'cover')
  const readingMinutes = estimateReadingMinutes(frontMatter.content)

  return (
    <article className="glass-control group flex flex-col gap-3 overflow-hidden rounded-2xl transition-shadow hover:shadow-lg">
      {cover !== null && (
        <Link
          to="/article/$slug"
          params={{ slug: article.slug }}
          className="block aspect-[16/9] overflow-hidden bg-muted"
        >
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </Link>
      )}
      <div className="flex flex-col gap-3 p-6">
        <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="size-3.5" />
            {formatDate(article.updated_at.slice(0, 10), locale)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3.5" />
            {t('article.reading', { min: readingMinutes })}
          </span>
          {article.created_by_name !== '' && (
            <span>{article.created_by_name}</span>
          )}
          {article.status === 'draft' && (
            <Badge variant="outline">{t('article.draft')}</Badge>
          )}
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
          {excerptFromMarkdown(frontMatter.content)}
        </p>
        {article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {article.tags.map((tag) => (
              <Badge key={tag} variant="outline">
                <Link to="/article" search={{ tag }} className="no-underline">
                  {tag}
                </Link>
              </Badge>
            ))}
          </div>
        )}
        <Button asChild size="sm" variant="ghost" className="mt-auto self-start">
          <Link to="/article/$slug" params={{ slug: article.slug }}>
            {t('article.readMore')}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </Button>
      </div>
    </article>
  )
}

export function ArticleIndexPage({ tag }: { tag?: string }) {
  const { t, i18n } = useTranslation()
  const { has } = useAuth()
  const navigate = useNavigate()

  usePageTitle(tag ? `#${tag} — ${t('article.indexTitle')}` : t('article.indexTitle'))

  const [query, setQuery] = useState('')
  const q = query.trim()

  const list = useQuery({
    queryKey: ['pages', { tag }],
    queryFn: () => pagesApi.list({ per_page: 50, tag }),
  })

  const search = useQuery({
    queryKey: ['pages', 'search', q],
    queryFn: () => pagesApi.search(q),
    enabled: q.length >= 3,
  })

  const allTags = useQuery({
    queryKey: ['tags'],
    queryFn: tagsApi.list,
  })

  const searching = q.length >= 3

  function selectTag(next: string | undefined) {
    navigate({
      to: '/article',
      search: next !== undefined ? { tag: next } : {},
    })
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t('article.indexTitle')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('article.indexDescription')}
          </p>
        </div>
        {has('pages.write') && (
          <Button asChild variant="glass" size="sm">
            <Link to="/editor/new">
              <FilePenLine />
              {t('article.newPage')}
            </Link>
          </Button>
        )}
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('article.searchPlaceholder')}
          className="pl-8"
        />
      </div>

      {!searching && allTags.data !== undefined && allTags.data.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => selectTag(undefined)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              tag === undefined
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {t('article.allTags')}
          </button>
          {allTags.data.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => selectTag(item.name)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                tag === item.name
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {item.name}
              <span className="ml-1 text-muted-foreground/70">{item.count}</span>
            </button>
          ))}
        </div>
      )}

      {searching ? (
        search.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('article.searching')}</p>
        ) : search.data && search.data.items.length > 0 ? (
          <div className="space-y-4">
            {search.data.items.map((result) => (
              <SearchCard key={result.slug} result={result} locale={i18n.language} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('article.searchEmpty')}</p>
        )
      ) : list.isLoading || list.data === undefined ? (
        <div className="space-y-6" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="glass-control animate-pulse rounded-2xl">
              <div className="space-y-3 p-6">
                <div className="h-3 w-1/3 rounded bg-muted" />
                <div className="h-5 w-3/4 rounded bg-muted" />
                <div className="h-3 w-full rounded bg-muted" />
                <div className="h-3 w-5/6 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : list.data.items.length === 0 ? (
        <div className="glass-control rounded-2xl p-8 text-center">
          <p className="text-sm text-muted-foreground">{t('article.empty')}</p>
          {has('pages.write') && (
            <Button asChild variant="glass" size="sm" className="mt-4">
              <Link to="/editor/new">{t('article.newPage')}</Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {list.data.items.map((article) => (
            <ArticleCard key={article.slug} article={article} locale={i18n.language} />
          ))}
        </div>
      )}
    </div>
  )
}
