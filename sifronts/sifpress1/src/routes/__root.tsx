import { useQuery } from '@tanstack/react-query';
import { createRootRoute, Link, Outlet, useRouterState } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AmbientBackground } from '@/components/ambient-background';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { settingsApi } from 'ui-sdk';

function RootLayout() {
  const pathname = useRouterState({
    select: state => state.location.pathname,
  });

  const settings = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  });

  useEffect(() => {
    const title = settings.data?.site_name ?? 'Sifpress';
    document.title = title;
  }, [settings.data]);

  useEffect(() => {
    const url = window.location.pathname + window.location.search;
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_path: url });
    }
    if (typeof window.plausible === 'function') {
      window.plausible('pageview', { url });
    }
  }, [pathname]);

  let content: ReactNode;

  if (settings.isLoading) {
    content = (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  } else {
    content = <Outlet />;
  }

  return (
    <div className="ambient-bg min-h-screen w-full overflow-x-clip">
      <AmbientBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
        <SiteHeader />
        <main className="animate-in slide-in-from-bottom-3 duration-500 ease-out">{content}</main>
        <SiteFooter />
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
