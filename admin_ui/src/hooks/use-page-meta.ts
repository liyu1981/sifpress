import { useEffect } from 'react';

export interface PageMeta {
  title: string;
  description?: string;
  image?: string;
  canonical?: string;
  noindex?: boolean;
  type?: string;
  siteName?: string;
  twitterHandle?: string;
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

function upsertLinkCanonical(href: string): void {
  const existing = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');

  if (href === '') {
    existing?.remove();
    return;
  }

  if (existing !== null) {
    existing.setAttribute('href', href);
    return;
  }

  const link = document.createElement('link');
  link.setAttribute('rel', 'canonical');
  link.setAttribute('href', href);
  document.head.appendChild(link);
}

/**
 * Client-side head sync: mirrors the server-side SEO injection for SPA
 * navigation (which never hits the server). Updates <title>, meta
 * description, Open Graph, Twitter cards, robots, and the canonical link.
 * Empty values remove their tag, so stale meta can't linger between routes.
 */
export function usePageMeta(meta: PageMeta | null): void {
  useEffect(() => {
    if (meta === null) {
      return;
    }

    const {
      title,
      description = '',
      image = '',
      canonical = '',
      noindex = false,
      type = 'website',
    } = meta;

    document.title = title;

    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[name="robots"]', {
      name: 'robots',
      content: noindex ? 'noindex,nofollow' : '',
    });
    upsertLinkCanonical(canonical);

    const ogTitle = title;
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: ogTitle });
    upsertMeta('meta[property="og:description"]', {
      property: 'og:description',
      content: description,
    });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonical });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image });

    if (meta.siteName !== undefined) {
      upsertMeta('meta[property="og:site_name"]', {
        property: 'og:site_name',
        content: meta.siteName,
      });
    }

    const card = image !== '' ? 'summary_large_image' : 'summary';
    upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: card });
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title });
    upsertMeta('meta[name="twitter:description"]', {
      name: 'twitter:description',
      content: description,
    });
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image });

    if (meta.twitterHandle !== undefined) {
      const handle = meta.twitterHandle.startsWith('@')
        ? meta.twitterHandle
        : `@${meta.twitterHandle}`;
      upsertMeta('meta[name="twitter:site"]', { name: 'twitter:site', content: handle });
    }
  }, [meta]);
}
