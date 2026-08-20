import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { settingsApi, type SeoSettings } from './pages';
import { assetUrl } from './api';

/**
 * Fetch site-wide SEO/favicon/tracking settings. Wraps `settingsApi.get`
 * with React Query for caching and loading state.
 */
export function useSiteSettings() {
  return useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  });
}

/**
 * Favicon URL from site settings. Returns the asset URL when a custom
 * favicon is configured, or the built-in `/favicon` fallback.
 */
export function faviconUrl(settings: SeoSettings | undefined): string {
  const id = settings?.favicon_asset_id ?? '';
  if (id === '' || id === '0') {
    const base = window.location.pathname;
    return `${base}?p=sifpress/favicon`;
  }
  const v = settings?.favicon_version ?? '0';
  return assetUrl(Number(id)) + '&v=' + v;
}

/**
 * Apple-touch-icon URL from site settings. Returns the asset URL when
 * configured, or empty string when none is set.
 */
export function appleTouchIconUrl(settings: SeoSettings | undefined): string {
  const id = settings?.apple_touch_icon_asset_id ?? '';
  if (id === '' || id === '0') {
    return '';
  }
  const v = settings?.favicon_version ?? '0';
  return assetUrl(Number(id)) + '&v=' + v;
}

function upsertMeta(selector: string, attrs: Record<string, string>): void {
  const existing = document.querySelector<HTMLMetaElement>(selector);

  if (attrs.content === '') {
    existing?.remove();
    return;
  }

  if (existing !== null) {
    for (const [key, value] of Object.entries(attrs)) {
      existing.setAttribute(key, value);
    }
    return;
  }

  const meta = document.createElement('meta');
  for (const [key, value] of Object.entries(attrs)) {
    meta.setAttribute(key, value);
  }
  document.head.appendChild(meta);
}

function upsertLink(
  rel: string,
  href: string,
  attrs: Record<string, string> = {},
): void {
  const existing = document.querySelector<HTMLLinkElement>(
    `link[rel="${rel}"]`,
  );

  if (href === '') {
    existing?.remove();
    return;
  }

  if (existing !== null) {
    existing.setAttribute('href', href);
    for (const [key, value] of Object.entries(attrs)) {
      existing.setAttribute(key, value);
    }
    return;
  }

  const link = document.createElement('link');
  link.setAttribute('rel', rel);
  link.setAttribute('href', href);
  for (const [key, value] of Object.entries(attrs)) {
    link.setAttribute(key, value);
  }
  document.head.appendChild(link);
}

export interface SiteHeadProps {
  settings: SeoSettings | undefined;
}

/**
 * Renders site-wide `<head>` tags for a sifront page: title, favicon,
 * apple-touch-icon. Call this once at the app root. Per-page SEO
 * overrides (title, description, OG) should use `usePageMeta`.
 */
export function SiteHead({ settings }: SiteHeadProps) {
  useEffect(() => {
    if (settings === undefined) return;

    const siteName = settings.site_name || 'Sifpress';
    if (document.title === '') {
      document.title = siteName;
    }

    upsertLink('icon', faviconUrl(settings), {
      type: settings.favicon_mime || 'image/svg+xml',
    });

    const appleUrl = appleTouchIconUrl(settings);
    upsertLink('apple-touch-icon', appleUrl);
  }, [settings]);

  return null;
}
