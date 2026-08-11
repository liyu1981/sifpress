import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { LanguageToggle } from '@/components/language-toggle'
import { ThemeToggle } from '@/components/theme-toggle'
import { EditorPage } from '@/pages/editor'
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

function AppNav() {
  const { t } = useTranslation()
  const activeClass = 'bg-accent text-accent-foreground'

  return (
    <nav className="apple-panel sticky top-4 z-10 mx-auto flex w-fit items-center gap-1 rounded-full p-1">
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
          to="/editor/$id"
          params={{ id: '123' }}
          activeOptions={{ exact: true }}
          activeProps={{ className: activeClass }}
        >
          {t('nav.editor')}
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
  )
}

function RootLayout() {
  return (
    <div className="ambient-bg min-h-screen w-full">
      <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-6 py-12">
        <div className="sticky top-4 z-10 flex items-center justify-end gap-1">
          <LanguageToggle />
          <ThemeToggle />
        </div>
        <AppNav />
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

export const editorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/editor/$id',
  component: EditorPage,
})

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
  editorRoute,
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
