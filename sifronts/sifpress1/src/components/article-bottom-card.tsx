import { RawHtml } from '@/components/raw-html';
import { KvEditButton } from '@/components/kv-edit-dialog';
import { useKvEditAccess } from '@/lib/kv-editor';

export const ARTICLE_BOTTOM_KEY = 'sifpress1.article.bottom';

export function ArticleBottomCard({ html }: { html: string }) {
  const { canEdit } = useKvEditAccess(ARTICLE_BOTTOM_KEY);
  const hasContent = html.trim() !== '';

  if (!hasContent && !canEdit) {
    return null;
  }

  if (!hasContent) {
    return (
      <section className="glass-control flex items-center justify-between gap-3 rounded-2xl border border-dashed p-4">
        <p className="text-sm text-muted-foreground">No content below the article yet.</p>
        <KvEditButton kvKey={ARTICLE_BOTTOM_KEY} label="Add content" />
      </section>
    );
  }

  return (
    <section
      aria-label="Article footer"
      className="glass-control glass-control-read overflow-hidden rounded-2xl"
    >
      {canEdit && (
        <div className="flex justify-end px-3 pt-3">
          <KvEditButton kvKey={ARTICLE_BOTTOM_KEY} />
        </div>
      )}
      <RawHtml html={html} className="px-6 pt-2 pb-8 sm:px-10 sm:pt-3 sm:pb-10" />
    </section>
  );
}
