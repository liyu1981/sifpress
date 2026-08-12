import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { AmbientBackground } from '@/components/ambient-background'
import { LanguageToggle } from '@/components/language-toggle'
import { ThemeToggle } from '@/components/theme-toggle'
import { ArticleDetailPage } from '@/pages/article-detail'
import { ArticleIndexPage } from '@/pages/article-index'
import { HomePage } from '@/pages/home'
import { NotFoundPage } from '@/pages/not-found'
import { SettingsPage } from '@/pages/settings'
import { useTranslation } from 'react-i18next'

const basePath = window.location.pathname

function normalizeInternalPath(route: string): string {
  const path = route.startsWith('/') ? route : `/${route}`

  if (path === '/') {
    return '/'
  }

  return path.replace(/\/+$/, '')
}

function AppHeader() {
  const { t } = useTranslation()
  const activeClass = 'bg-accent text-accent-foreground'

  return (
    <header className="apple-panel sticky top-4 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl px-2 py-2">
      <nav className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: activeClass }}
          >
            {t('nav.home')}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/article"
            activeOptions={{ exact: true }}
            activeProps={{ className: activeClass }}
          >
            {t('nav.article')}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/settings"
            activeOptions={{ exact: true }}
            activeProps={{ className: activeClass }}
          >
            {t('nav.settings')}
          </Link>
        </Button>
      </nav>
      <div className="flex items-center gap-1">
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </header>
  )
}

function RootLayout() {
  return (
    <div className="ambient-bg min-h-screen w-full">
      <AmbientBackground />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <AppHeader />
        <main className="animate-in slide-in-from-bottom-3 duration-500 ease-out">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

const rootRoute = createRootRoute({
  component: RootLayout,
})

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
})

export const articleIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/article',
  component: ArticleIndexPage,
})

export const articleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/article/$slug',
  component: ArticleDetailRouteComponent,
})

function ArticleDetailRouteComponent() {
  return <ArticleDetailPage slug={articleDetailRoute.useParams().slug} />
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

export const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$',
  component: NotFoundPage,
})

const routeTree = rootRoute.addChildren([
  indexRoute,
  articleIndexRoute,
  articleDetailRoute,
  settingsRoute,
  notFoundRoute,
])

export const router = createRouter({
  routeTree,
  rewrite: {
    input: ({ url }) => {
      const u = url.searchParams.get('u')

      url.searchParams.delete('u')
      url.pathname = u != null && u !== '' ? normalizeInternalPath(u) : '/'

      return url
    },
    output: ({ url }) => {
      const internalPath = url.pathname

      url.pathname = basePath

      if (internalPath === '/') {
        url.searchParams.delete('u')
      } else {
        url.searchParams.set('u', internalPath.replace(/^\//, ''))
      }

      return url
    },
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
