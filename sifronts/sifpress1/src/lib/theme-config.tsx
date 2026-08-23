import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { kvsApi } from 'ui-sdk';
import fallbackMeta from '../../meta.json';

export interface LinkItem {
  label: string;
  href: string;
  icon?: string;
  color?: string;
}

export interface ThemeConfig {
  sidebarWelcome: string;
  sidebarAbout: string;
  sidebarAvatar: string;
  links: LinkItem[];
  footerText: string;
  footerCopyright: string;
}

function parseSifrontMeta(raw: unknown): Record<string, unknown> {
  const map: Record<string, unknown> = {};

  if (
    raw !== null &&
    typeof raw === 'object' &&
    Array.isArray((raw as SifrontMeta).require_keys)
  ) {
    for (const entry of (raw as SifrontMeta).require_keys) {
      if (entry !== null && typeof entry === 'object') {
        for (const [key, value] of Object.entries(entry)) {
          map[key] = value;
        }
      }
    }
  }

  return map;
}

const LINK_ICONS: Record<string, string> = {
  instagram:
    'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.439 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
  linkedin:
    'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  github:
    'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  facebook:
    'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  email:
    'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
  rss: 'M4 11a9 9 0 0 1 9 9h2.5A11.5 11.5 0 0 0 4 8.5zm0 4a5 5 0 0 1 5 5h2.5A7.5 7.5 0 0 0 4 12.5zm1.5 4.75A1.75 1.75 0 1 0 5.5 19 1.75 1.75 0 0 0 5.5 16.75z',
};

const GENERIC_ICON =
  'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71';

export function linkIconPath(icon?: string): string {
  if (icon && LINK_ICONS[icon]) {
    return LINK_ICONS[icon];
  }
  return GENERIC_ICON;
}

function asString(value: unknown): value is string {
  return typeof value === 'string';
}

function asLinkArray(value: unknown): LinkItem[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const out: LinkItem[] = [];

  for (const item of value) {
    if (
      item !== null &&
      typeof item === 'object' &&
      asString((item as Record<string, unknown>).label) &&
      asString((item as Record<string, unknown>).href)
    ) {
      const record = item as Record<string, unknown>;
      out.push({
        label: record.label as string,
        href: record.href as string,
        icon: asString(record.icon) ? (record.icon as string) : undefined,
        color: asString(record.color) ? (record.color as string) : undefined,
      });
    }
  }

  return out;
}

function buildConfig(data: Record<string, unknown>, defaults: Record<string, unknown>): ThemeConfig {
  const pick = (key: string): unknown => (data[key] !== undefined ? data[key] : defaults[key]);

  const str = (key: string): string => {
    const value = pick(key);
    return asString(value) ? value : '';
  };

  const links = ((): LinkItem[] => {
    const value = pick('sifpress1.sidebar.links');
    return asLinkArray(value) ?? asLinkArray(defaults['sifpress1.sidebar.links']) ?? [];
  })();

  return {
    sidebarWelcome: str('sifpress1.sidebar.welcome'),
    sidebarAbout: str('sifpress1.sidebar.about'),
    sidebarAvatar: str('sifpress1.sidebar.avatar'),
    links,
    footerText: str('sifpress1.footer.text') || 'Powered by Sifpress',
    footerCopyright: str('sifpress1.footer.copyright') || '© {year}',
  };
}

const ThemeConfigContext = createContext<ThemeConfig>({
  sidebarWelcome: '',
  sidebarAbout: '',
  sidebarAvatar: '',
  links: [],
  footerText: 'Powered by Sifpress',
  footerCopyright: '© {year}',
});

export function ThemeConfigProvider({ children }: { children: ReactNode }) {
  const meta = window._sifront_meta ?? (fallbackMeta as SifrontMeta);
  const defaults = parseSifrontMeta(meta);
  const keys = Object.keys(defaults);

  const query = useQuery({
    queryKey: ['theme-config'],
    queryFn: () => kvsApi.getMany(keys),
    staleTime: 60_000,
  });

  const config = buildConfig(query.data?.data ?? {}, defaults);

  return <ThemeConfigContext.Provider value={config}>{children}</ThemeConfigContext.Provider>;
}

export function useThemeConfig(): ThemeConfig {
  return useContext(ThemeConfigContext);
}
