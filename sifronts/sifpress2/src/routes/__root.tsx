import { useQuery } from '@tanstack/react-query';
import { createRootRoute, Outlet, useRouterState } from '@tanstack/react-router';
import { useEffect } from 'react';
import { AnnouncementBar } from '@/components/announcement-bar';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { LoadingBlock } from '@/components/states';
import { ThemeConfigProvider } from '@/lib/theme-config';
import { settingsApi, usePageMeta } from 'ui-sdk';

function useSiteMeta() {
  const settings = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  });

  const siteName = settings.data?.site_name?.trim() || 'Sifpress';

  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  usePageMeta({
    title: siteName,
    description: settings.data?.site_description,
    image: settings.data?.default_og_image,
    siteName,
    twitterHandle: settings.data?.twitter_handle,
  });

  return settings;
}

function RootLayout() {
  const pathname = useRouterState({
    select: state => state.location.pathname,
  });

  const settings = useSiteMeta();

  useEffect(() => {
    const url = window.location.pathname + window.location.search;

    if (typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', { page_path: url });
    }

    if (typeof window.plausible === 'function') {
      window.plausible('pageview', { url });
    }
  }, [pathname]);

  return (
    <ThemeConfigProvider>
      <div className="flex min-h-screen flex-col bg-paper">
        <AnnouncementBar />
        <SiteHeader />

        <main className="flex-1">{settings.isLoading ? <LoadingBlock /> : <Outlet />}</main>

        <SiteFooter />
      </div>
    </ThemeConfigProvider>
  );
}

export const Route = createRootRoute({
  component: RootLayout,
});
