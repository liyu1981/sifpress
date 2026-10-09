import { FilePenLine } from 'lucide-react';

export type PreviewMode = 'draft' | 'unsaved';

/**
 * Strip above an article that is being previewed rather than read: an amber
 * "not live" marker with the way back to the editor, so a screenshot of a
 * draft can never be mistaken for the published page.
 */
export function PreviewBanner({ mode, editHref }: { mode: PreviewMode; editHref: string }) {
  const text =
    mode === 'unsaved'
      ? 'Unsaved preview — this text has not been saved yet.'
      : 'Draft preview — this article is not published.';

  return (
    <div
      role="status"
      className="mx-auto mb-6 flex max-w-6xl flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3"
    >
      <span className="text-sm font-medium text-amber-700 dark:text-amber-300">{text}</span>
      <a
        href={editHref}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/15 dark:text-amber-300"
      >
        <FilePenLine className="size-3.5" />
        Edit
      </a>
    </div>
  );
}
