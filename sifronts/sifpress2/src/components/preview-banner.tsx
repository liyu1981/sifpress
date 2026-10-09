import { FilePenLine } from 'lucide-react';
import { kv, useCopy } from '@/lib/theme-config';

export type PreviewMode = 'draft' | 'unsaved';

/**
 * Strip above a story that is being previewed rather than read: the flat
 * newsprint equivalent of the amber marker, so a screenshot of a draft can
 * never be mistaken for the published page.
 */
export function PreviewBanner({ mode, editHref }: { mode: PreviewMode; editHref: string }) {
  const copy = useCopy();
  const key = mode === 'unsaved' ? 'unsavedPreview' : 'draftPreview';

  return (
    <div
      role="status"
      className="mx-auto mb-6 flex max-w-3xl flex-wrap items-center justify-between gap-3 border-y-2 border-amber-600 bg-amber-500/10 px-4 py-3"
    >
      <span {...kv(`copy.${key}`)} className="text-sm font-semibold text-amber-800">
        {copy(key)}
      </span>
      <a
        href={editHref}
        className="inline-flex items-center gap-1.5 border border-amber-600 px-2.5 py-1 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-600 hover:text-white"
      >
        <FilePenLine className="size-3.5" />
        Edit
      </a>
    </div>
  );
}
