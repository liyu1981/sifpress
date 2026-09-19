import { Link, useNavigate } from '@tanstack/react-router';
import { Menu, Search, Settings, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import type { SeoSettings, TagCount } from 'ui-sdk';
import { ThemeToggle } from '@/components/theme-toggle';
import { linkIconPath, useThemeConfig } from '@/lib/theme-config';
import { cn } from '@/lib/utils';

export function Sidebar({ tags, settings }: { tags: TagCount[]; settings?: SeoSettings }) {
  const navigate = useNavigate();
  const config = useThemeConfig();
  const [q, setQ] = useState('');
  const [navOpen, setNavOpen] = useState(false);

  const siteName = settings?.site_name ?? 'Welcome';
  const siteDescription = config.sidebarAbout || settings?.site_description || '';
  const welcome = config.sidebarWelcome || `Welcome, I am ${siteName}`;
  const initial = siteName.trim().charAt(0).toUpperCase() || 'Y';

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = q.trim();
    navigate({ to: '/', search: query ? { q: query } : {} });
  }

  return (
    <aside className="glass-control flex flex-col gap-6 rounded-2xl p-4 lg:p-6">
      {/*
        Mobile: the nav starts collapsed, showing only the avatar/logo and the
        site name. The toggle reveals the rest; on lg+ everything is always
        visible and this compact bar is hidden.
      */}
      <div className="flex items-center justify-between gap-3 lg:hidden">
        <Link to="/" search={{}} className="flex min-w-0 items-center gap-3">
          {config.sidebarAvatar !== '' ? (
            <img
              src={config.sidebarAvatar}
              alt=""
              className="size-10 shrink-0 -rotate-2 border-2 border-foreground bg-card object-cover shadow-sm"
            />
          ) : (
            <span className="flex size-10 shrink-0 -rotate-2 items-center justify-center border-2 border-foreground bg-muted font-serif text-lg text-foreground shadow-sm">
              {initial}
            </span>
          )}
          <span className="truncate font-serif text-lg font-bold text-foreground hover:underline">
            {siteName}
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setNavOpen(open => !open)}
          aria-expanded={navOpen}
          aria-controls="site-nav"
          aria-label={navOpen ? 'Collapse navigation' : 'Expand navigation'}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {navOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {/* Full navigation: always visible on lg+, toggled on mobile. */}
      <div id="site-nav" className={cn('flex-col gap-6 lg:flex', navOpen ? 'flex' : 'hidden')}>
        {siteDescription !== '' && (
          <p className="text-sm text-muted-foreground lg:hidden">{siteDescription}</p>
        )}

        <div className="hidden flex-col items-center lg:flex">
          <Link to="/" search={{}} className="flex flex-col items-center focus:outline-none">
            <div className="relative mb-4">
              <span
                aria-hidden="true"
                className="absolute -top-1.5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-foreground shadow-md"
              />
              <div className="-rotate-2 border-4 border-foreground bg-card p-1.5 shadow-sm">
                {config.sidebarAvatar !== '' ? (
                  <img
                    src={config.sidebarAvatar}
                    alt=""
                    className="aspect-square w-28 rounded-none object-cover"
                  />
                ) : (
                  <div className="flex aspect-square w-28 items-center justify-center bg-muted font-serif text-4xl text-foreground">
                    {initial}
                  </div>
                )}
              </div>
            </div>
            <h1 className="text-center font-serif text-xl font-bold text-foreground hover:underline">
              {welcome}
            </h1>
          </Link>
          <p className="mt-1 text-center text-sm text-muted-foreground">{siteDescription}</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="flex items-center gap-2 border-b border-foreground/70 py-1.5"
        >
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={q}
            onChange={event => setQ(event.target.value)}
            placeholder="Search ..."
            aria-label="Search"
            className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
          />
        </form>

        <nav aria-label="Tags">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Tags
          </h2>
          <ul className="mt-2 flex flex-col divide-y divide-border">
            {tags.map(tag => (
              <li key={tag.name}>
                <Link
                  to="/"
                  search={{ tag: tag.name }}
                  className="flex items-center justify-between py-2 text-sm text-foreground transition-colors hover:text-muted-foreground"
                >
                  <span>{tag.name}</span>
                  <span className="text-xs text-muted-foreground/60">{tag.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Links
          </h2>
          <ul className="mt-2 flex flex-col gap-1">
            {config.links.map(link => (
              <li key={link.label}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 py-0.5 text-sm text-foreground transition-colors hover:text-muted-foreground"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-5 shrink-0 fill-current"
                    style={{ color: link.color ?? undefined }}
                    aria-hidden="true"
                  >
                    <path d={linkIconPath(link.icon)} />
                  </svg>
                  <span className="underline decoration-foreground/40 underline-offset-4 transition-colors hover:decoration-muted-foreground/40">
                    {link.label}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-border pt-4">
          <ThemeToggle />
          <a
            href="?p=sifpress/admin"
            title="Admin"
            aria-label="Admin"
            className="inline-flex items-center justify-center rounded-md p-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Settings className="size-4" />
          </a>
        </div>
      </div>
    </aside>
  );
}
