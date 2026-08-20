import { useQuery } from '@tanstack/react-query';
import { createRootRoute, Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { ChevronDown, Loader2, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AmbientBackground } from '@/components/ambient-background';
import { MigrationScreen } from '@/components/migration-screen';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Toaster } from '@/components/ui/sonner';
import { useAuth } from 'ui-sdk';
import { DEMO_PAGE_SLUG, settingsApi, systemApi } from 'ui-sdk';
import { ChangePasswordPage } from '@/pages/change-password';
import { LoginPage } from '@/pages/login';

declare const APP_VERSION: string;

function AppHeader() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const activeClass = 'bg-accent text-accent-foreground';

  async function handleLogout() {
    await logout();
    navigate({ to: '/admin' });
  }

  return (
    <header className="apple-panel sticky top-4 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl -mx-4 px-6 py-2">
      <nav className="flex items-center gap-1">
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/admin/sifront"
            activeOptions={{ exact: true }}
            activeProps={{ className: activeClass }}
          >
            {t('nav.sifront')}
          </Link>
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link
            to="/admin/articles"
            activeOptions={{ exact: true }}
            activeProps={{ className: activeClass }}
          >
            {t('nav.article')}
          </Link>
        </Button>
        {user !== null && (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link
                to="/admin/assets"
                activeOptions={{ exact: true }}
                activeProps={{ className: activeClass }}
              >
                {t('nav.assets')}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link
                to="/admin/account-admin"
                activeOptions={{ exact: true }}
                activeProps={{ className: activeClass }}
              >
                {t('nav.account')}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link
                to="/admin/kvs"
                activeOptions={{ exact: true }}
                activeProps={{ className: activeClass }}
              >
                {t('nav.kvs')}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link
                to="/admin/settings"
                activeOptions={{ exact: true }}
                activeProps={{ className: activeClass }}
              >
                {t('nav.settings')}
              </Link>
            </Button>
          </>
        )}
      </nav>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        {user !== null && (
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
                <Link to="/admin/account">{t('nav.myAccount')}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleLogout()}>
                <LogOut />
                {t('nav.logout')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {user === null && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/login">{t('nav.login')}</Link>
          </Button>
        )}
      </div>
    </header>
  );
}

function RootLayout() {
  const { t } = useTranslation();
  const { status, user } = useAuth();
  const pathname = useRouterState({
    select: state => state.location.pathname,
  });

  const settings = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  });

  useEffect(() => {
    const url = window.location.pathname + window.location.search;
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_path: url });
    }
    if (typeof window.plausible === 'function') {
      window.plausible('pageview', { url });
    }
  }, [pathname]);

  const migration = useQuery({
    queryKey: ['system', 'status'],
    queryFn: systemApi.status,
    staleTime: 60_000,
  });

  if (migration.data?.migrate_required) {
    return <MigrationScreen />;
  }

  if (status === 'loading') {
    return (
      <div className="ambient-bg min-h-screen w-full">
        <AmbientBackground />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const needsAuth = pathname.startsWith('/admin') && pathname !== '/admin/login';

  let content: ReactNode;

  if (user !== null && user.must_change_password) {
    content = <ChangePasswordPage />;
  } else if (user === null && needsAuth) {
    content = <LoginPage next={pathname} />;
  } else {
    content = <Outlet />;
  }

  return (
    <div className="ambient-bg min-h-screen w-full overflow-x-clip">
      <AmbientBackground />
      <Toaster />
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <AppHeader />
        <main className="animate-in slide-in-from-bottom-3 duration-500 ease-out">{content}</main>

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
            to="/admin/article/$slug"
            params={{ slug: DEMO_PAGE_SLUG }}
            className="text-foreground transition-colors hover:text-muted-foreground hover:underline"
          >
            {t('footer.demoPage')}
          </Link>
        </footer>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
