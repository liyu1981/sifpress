import { Link, type LinkOptions } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight } from 'lucide-react';

export function Pagination({
  page,
  pageCount,
  buildHref,
}: {
  page: number;
  pageCount: number;
  buildHref: (page: number) => LinkOptions;
}) {
  if (pageCount <= 1) {
    return null;
  }

  const className =
    'inline-flex items-center gap-2 text-sm font-medium text-ink-soft transition-colors hover:text-ink';

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 border-t border-rule-strong pt-5"
    >
      {page > 1 ? (
        <Link {...buildHref(page - 1)} className={className}>
          <ArrowLeft className="size-4" />
          Newer
        </Link>
      ) : (
        <span />
      )}

      <span className="meta-line">
        Page {page} of {pageCount}
      </span>

      {page < pageCount ? (
        <Link {...buildHref(page + 1)} className={className}>
          Older
          <ArrowRight className="size-4" />
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
