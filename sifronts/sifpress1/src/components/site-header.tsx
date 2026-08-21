import { Link } from '@tanstack/react-router';
import { Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

export function SiteHeader() {
  return (
    <header className="apple-panel sticky top-4 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl -mx-4 px-6 py-2">
      <nav className="flex items-center gap-1">
        <Link
          to="/"
          className="px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:text-muted-foreground"
        >
          Home
        </Link>
        <Link
          to="/"
          className="px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Articles
        </Link>
      </nav>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <a
          href="?p=sifpress/admin"
          className={cn(
            'inline-flex items-center justify-center rounded-md p-2 text-sm',
            'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          )}
          title="Admin"
          aria-label="Admin"
        >
          <Settings className="size-4" />
        </a>
      </div>
    </header>
  );
}
