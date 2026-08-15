import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Loader2, LogOut } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Toaster } from '@/components/ui/sonner'
import { AmbientBackground } from '@/components/ambient-background'
import { ThemeToggle } from '@/components/theme-toggle'
import { MigrationScreen } from '@/components/migration-screen'
import { ArticleDetailPage } from '@/pages/article-detail'
import { ArticleIndexPage } from '@/pages/article-index'
import { AssetsPage } from '@/pages/assets'
import { ChangePasswordPage } from '@/pages/change-password'
import { EditorPage } from '@/pages/editor'
import { HomePage } from '@/pages/home'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'
import { SettingsPage } from '@/pages/settings'
import { useAuth } from '@/lib/auth'
import { systemApi, DEMO_PAGE_SLUG } from '@/lib/pages'

const basePath = window.location.pathname

const APP_VERSION =
  document.querySelector('meta[name="app-version"]')?.getAttribute('content') ??
  '0.1.0'

function normalizeInternalPath(route: string): string {
  const path = route.startsWith('/') ? route : `/${route}`

  if (path === '/') {
    return '/'
  }

  return path.replace(/\/+$/, '')
}

function AppHeader() {
  const { t } = useTranslation()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const activeClass = 'bg-accent text-accent-foreground'

  async function handleLogout() {
    await logout()
    navigate({ to: '/' })
  }

  return (
    <header className="apple-panel sticky top-4 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl -mx-4 px-6 py-2">
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
      </nav>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {user !== null ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50 hover:bg-muted"
                aria-label={t('nav.accountMenu')}
              >
                <img
                  src={user.avatar_url}
                  alt=""
                  className="size-7 shrink-0 rounded-full bg-muted object-cover"
                />
                <span className="hidden max-w-32 truncate sm:inline">
                  {user.name || user.username}
                </span>
                <ChevronDown className="size-3.5 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link to="/assets" activeOptions={{ exact: true }}>
                  {t('nav.assets')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/settings" activeOptions={{ exact: true }}>
                  {t('nav.settings')}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleLogout()}>
                <LogOut />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild variant="ghost" size="sm">
            <Link to="/login">{t('nav.login')}</Link>
          </Button>
        )}
      </div>
    </header>
  )
}

function RootLayout() {
  const { t } = useTranslation()
  const { status, user } = useAuth()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  const migration = useQuery({
    queryKey: ['system', 'status'],
    queryFn: systemApi.status,
    staleTime: 60_000,
  })

  if (migration.data?.migrate_required) {
    return <MigrationScreen />
  }

  if (status === 'loading') {
    return (
      <div className="ambient-bg min-h-screen w-full">
        <AmbientBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  const needsAuth = pathname === '/settings' || pathname === '/assets' || pathname.startsWith('/editor')

  let content: ReactNode

  if (user !== null && user.must_change_password) {
    content = <ChangePasswordPage />
  } else if (user === null && needsAuth && pathname !== '/login') {
    content = <LoginPage next={pathname} />
  } else {
    content = <Outlet />
  }

  return (
    <div className="ambient-bg min-h-screen w-full overflow-x-clip">
      <AmbientBackground />
      <Toaster />
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <AppHeader />
        <main className="animate-in slide-in-from-bottom-3 duration-500 ease-out">
          {content}
        </main>

        <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-6 pb-2 text-sm text-muted-foreground">
          <span>
            {t('footer.poweredBy', { version: APP_VERSION })}
            <span aria-hidden="true"> · </span>
            <a
              href="https://github.com/liyu1981/sifpress"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground transition-colors hover:text-muted-foreground hover:underline"
            >
              GitHub
            </a>
          </span>
          <Link
            to="/article/$slug"
            params={{ slug: DEMO_PAGE_SLUG }}
            className="text-foreground transition-colors hover:text-muted-foreground hover:underline"
          >
            {t('footer.demoPage')}
          </Link>
        </footer>
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
  component: ArticleIndexRouteComponent,
  validateSearch: (search): { tag?: string } => ({
    ...(typeof search.tag === 'string' && search.tag !== '' ? { tag: search.tag } : {}),
  }),
})

function ArticleIndexRouteComponent() {
  const { tag } = articleIndexRoute.useSearch()
  return <ArticleIndexPage tag={tag} />
}

export const articleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/article/$slug',
  component: ArticleDetailRouteComponent,
})

function ArticleDetailRouteComponent() {
  return <ArticleDetailPage slug={articleDetailRoute.useParams().slug} />
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginRouteComponent,
})

function LoginRouteComponent() {
  return <LoginPage />
}

export const editorNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor/new',
  component: EditorNewRouteComponent,
})

function EditorNewRouteComponent() {
  return <EditorPage slug={null} />
}

export const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor/$slug',
  component: EditorRouteComponent,
})

function EditorRouteComponent() {
  return <EditorPage slug={editorRoute.useParams().slug} />
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
})

export const assetsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/assets',
  component: AssetsPage,
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
  editorNewRoute,
  editorRoute,
  loginRoute,
  settingsRoute,
  assetsRoute,
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
