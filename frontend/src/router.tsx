import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
} from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { EditorPage } from '@/pages/editor'
import { HomePage } from '@/pages/home'
import { NotFoundPage } from '@/pages/not-found'
import { SettingsPage } from '@/pages/settings'

const basePath = window.location.pathname

function normalizeInternalPath(route: string): string {
  const path = route.startsWith('/') ? route : `/${route}`

  if (path === '/') {
    return '/'
  }

  return path.replace(/\/+$/, '')
}

function AppNav() {
  const activeClass = 'bg-accent text-accent-foreground'

  return (
    <nav className="flex items-center gap-2">
      <Button asChild variant="ghost" size="sm">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          activeProps={{ className: cn(activeClass) }}
        >
          Home
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link
          to="/editor/$id"
          params={{ id: '123' }}
          activeOptions={{ exact: true }}
          activeProps={{ className: cn(activeClass) }}
        >
          Editor 123
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm">
        <Link
          to="/settings"
          activeOptions={{ exact: true }}
          activeProps={{ className: cn(activeClass) }}
        >
          Settings
        </Link>
      </Button>
    </nav>
  )
}

function RootLayout() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-8 px-6 py-12">
      <AppNav />
      <Outlet />
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
