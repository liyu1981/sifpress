import { useQuery } from '@tanstack/react-query';
import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { AmbientBackground } from '@/components/ambient-background';
import { SiteFooter } from '@/components/site-footer';
import { Sidebar } from '@/components/sidebar';
import { ThemeConfigProvider } from '@/lib/theme-config';
import { settingsApi, tagsApi } from 'ui-sdk';

function RootLayout() {
  const pathname = useRouterState({
    select: state => state.location.pathname,
  });

  const settings = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  });

  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: tagsApi.list,
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
    content = (
      <div className="flex w-full flex-col gap-10 lg:flex-row">
        <aside className="w-full shrink-0 lg:sticky lg:top-8 lg:h-fit lg:w-72">
          <Sidebar tags={tags.data ?? []} settings={settings.data} />
        </aside>
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <ThemeConfigProvider>
      <div className="ambient-bg min-h-screen w-full overflow-x-clip">
        <AmbientBackground />
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
          {content}
          <SiteFooter />
        </div>
      </div>
    </ThemeConfigProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
