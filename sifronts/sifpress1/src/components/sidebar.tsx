import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { Search, Settings } from 'lucide-react';
import type { FormEvent } from 'react';
import type { SeoSettings, TagCount } from 'ui-sdk';
import { ThemeToggle } from '@/components/theme-toggle';

const SOCIALS = [
  {
    label: 'Instagram',
    href: 'https://instagram.com/liyu1981',
    color: '#E4405F',
    path: 'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
  },
  {
    label: 'LinkedIn',
    href: 'https://au.linkedin.com/in/liyu1981',
    color: '#0A66C2',
    path: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  },
  {
    label: 'GitHub',
    href: 'https://github.com/liyu1981',
    color: '#181717',
    path: 'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12',
  },
  {
    label: 'Facebook',
    href: 'https://facebook.com/liyu1981',
    color: '#1877F2',
    path: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  },
];

const LINKS = [
  { label: 'GitHub', href: 'https://github.com/liyu1981' },
  { label: 'Email', href: 'mailto:liyu1981@gmail.com' },
];

export function Sidebar({ tags, settings }: { tags: TagCount[]; settings?: SeoSettings }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');

  const siteName = settings?.site_name ?? 'Welcome';
  const siteDescription = settings?.site_description ?? '';
  const initial = siteName.trim().charAt(0).toUpperCase() || 'Y';

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = q.trim();
    navigate({ to: '/', search: query ? { q: query } : {} });
  }

  return (
    <aside className="glass-control flex flex-col gap-6 rounded-2xl p-6">
      <div className="flex flex-col items-center">
        <div className="relative mb-4">
          <span
            aria-hidden="true"
            className="absolute -top-1.5 left-1/2 size-2 -translate-x-1/2 rounded-full bg-foreground shadow-md"
          />
          <div className="-rotate-2 border-4 border-foreground bg-card p-1.5 shadow-sm">
            <div className="flex aspect-square w-28 items-center justify-center bg-muted font-serif text-4xl text-foreground">
              {initial}
            </div>
          </div>
        </div>
        <h1 className="text-center font-serif text-xl font-bold text-foreground">
          Welcome, I am {siteName}
        </h1>
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

      <nav aria-label="Categories">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Categories
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

      <div className="flex items-center justify-center gap-3">
        {SOCIALS.map(social => (
          <a
            key={social.label}
            href={social.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={social.label}
            title={social.label}
            className="flex size-8 items-center justify-center rounded-full text-white transition-transform hover:scale-110"
            style={{ backgroundColor: social.color }}
          >
            <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden="true">
              <path d={social.path} />
            </svg>
          </a>
        ))}
      </div>

      <div className="border-t border-border" />

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Links &amp; Shortcuts
        </h2>
        <ul className="mt-2 flex flex-col gap-1">
          {LINKS.map(link => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="py-0.5 text-sm text-foreground underline decoration-foreground/40 underline-offset-4 transition-colors hover:text-muted-foreground hover:decoration-muted-foreground/40"
              >
                {link.label}
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
    </aside>
  );
}
