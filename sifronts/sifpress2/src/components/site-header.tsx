import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronDown, Menu, Search, X } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { useCopy, useThemeConfig } from '@/lib/theme-config';
import { settingsApi, tagsApi } from 'ui-sdk';

function useSiteName(): string {
  const settings = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  });

  return settings.data?.site_name?.trim() || 'Sifpress';
}

function useSections(): string[] {
  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list(),
    staleTime: 60_000,
  });

  return (tags.data ?? []).map(tag => tag.name).slice(0, 12);
}

function SearchPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const copy = useCopy();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();

    const query = new FormData(event.currentTarget).get('q');

    onClose();
    navigate({ to: '/', search: typeof query === 'string' && query !== '' ? { q: query } : {} });
  };

  return (
    <div className="absolute inset-x-0 top-full border-b border-rule bg-paper">
      <form
        onSubmit={onSubmit}
        className="mx-auto flex w-full max-w-8xl items-center gap-3 px-4 py-4 sm:px-6"
      >
        <Search className="size-4 shrink-0 text-ink-faint" />
        <input
          ref={inputRef}
          name="q"
          type="search"
          autoComplete="off"
          placeholder={copy('searchPlaceholder')}
          className="headline-tight w-full bg-transparent text-lg outline-none placeholder:text-ink-faint"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={copy('close')}
          className="inline-flex size-8 items-center justify-center rounded-[3px] text-ink-soft hover:bg-muted"
        >
          <X className="size-4" />
        </button>
      </form>
    </div>
  );
}

function SectionsMenu({ sections }: { sections: string[] }) {
  const [open, setOpen] = useState(false);
  const copy = useCopy();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: MouseEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (sections.length === 0) {
    return null;
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
      >
        {copy('sections')}
        <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-3 w-56 border border-rule bg-paper p-1 shadow-[0_18px_40px_-28px_rgb(0_0_0/0.45)]">
          {sections.map(section => (
            <Link
              key={section}
              to="/section/$section"
              params={{ section }}
              onClick={() => setOpen(false)}
              className="block rounded-[3px] px-3 py-2 text-sm text-ink-soft transition-colors hover:bg-muted hover:text-ink"
            >
              {section}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function SiteHeader() {
  const siteName = useSiteName();
  const sections = useSections();
  const copy = useCopy();
  const { newsletter, footerLinks, mastheadKicker } = useThemeConfig();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/92 backdrop-blur-md">
      <div className="relative mx-auto flex h-16 w-full max-w-8xl items-center gap-3 px-4 sm:px-6">
        <div className="flex flex-1 items-center gap-1">
          <button
            type="button"
            onClick={() => setMenuOpen(value => !value)}
            aria-label={copy('menu')}
            aria-expanded={menuOpen}
            className="inline-flex size-9 items-center justify-center rounded-[3px] text-ink transition-colors hover:bg-muted md:hidden"
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          <nav className="hidden items-center gap-5 md:flex" aria-label="Primary">
            <Link
              to="/"
              className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
              activeProps={{ className: 'text-ink' }}
            >
              Home
            </Link>
            <SectionsMenu sections={sections} />
            {footerLinks.slice(0, 2).map(link => (
              <a
                key={link.href}
                href={link.href}
                className="text-sm font-medium text-ink-soft transition-colors hover:text-ink"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 flex-col items-center">
          <Link to="/" className="wordmark decoration-none text-xl sm:text-[1.6rem]">
            {siteName}
          </Link>
          {mastheadKicker !== '' && (
            <span className="meta-line hidden text-[10px] tracking-[0.2em] uppercase sm:block">
              {mastheadKicker}
            </span>
          )}
        </div>

        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-2">
          <button
            type="button"
            onClick={() => setSearchOpen(value => !value)}
            aria-label="Search"
            aria-expanded={searchOpen}
            className="inline-flex size-9 items-center justify-center rounded-[3px] text-ink-soft transition-colors hover:bg-muted hover:text-ink"
          >
            {searchOpen ? <X className="size-4" /> : <Search className="size-4" />}
          </button>

          <ThemeToggle />

          {newsletter !== null && (
            <a
              href={newsletter.href === '' ? undefined : newsletter.href}
              target={newsletter.href === '' ? undefined : '_blank'}
              rel={newsletter.href === '' ? undefined : 'noreferrer noopener'}
              className="btn-accent hidden sm:inline-flex"
            >
              {newsletter.cta}
            </a>
          )}
        </div>

        {menuOpen && (
          <nav
            aria-label="Mobile"
            className="absolute inset-x-0 top-full border-b border-rule bg-paper px-4 py-4 md:hidden"
          >
            <Link
              to="/"
              onClick={() => setMenuOpen(false)}
              className="block border-b border-rule py-3 text-base font-medium text-ink"
            >
              Home
            </Link>
            {sections.map(section => (
              <Link
                key={section}
                to="/section/$section"
                params={{ section }}
                onClick={() => setMenuOpen(false)}
                className="block border-b border-rule py-3 text-base font-medium text-ink-soft"
              >
                {section}
              </Link>
            ))}
            {footerLinks.map(link => (
              <a
                key={link.href}
                href={link.href}
                className="block border-b border-rule py-3 text-base font-medium text-ink-soft"
              >
                {link.label}
              </a>
            ))}
            {newsletter !== null && (
              <a
                href={newsletter.href === '' ? undefined : newsletter.href}
                className="btn-accent mt-4 w-full justify-center"
              >
                {newsletter.cta}
              </a>
            )}
          </nav>
        )}

        <SearchPanel open={searchOpen} onClose={() => setSearchOpen(false)} />
      </div>
    </header>
  );
}
