import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReviewDiffView } from '@/components/review-diff-view';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { buildDiff, changeStats, recompose } from '@/lib/diff/blocks';
import type { EditorSelectionContext } from '@/lib/md-editor';

export interface ReviewChangesDialogProps {
  open: boolean;
  before: string;
  after: string;
  /** Surrounding document lines, present for selection-only revisions. */
  context?: EditorSelectionContext;
  onClose: (result: string) => void;
}

function countLines(value: string): number {
  const lines = value.split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }
  return Math.max(lines.length, 1);
}

export function ReviewChangesDialog({
  open,
  before,
  after,
  context,
  onClose,
}: ReviewChangesDialogProps) {
  const { t } = useTranslation();
  const diff = useMemo(() => buildDiff(before, after), [before, after]);
  const [reverted, setReverted] = useState<ReadonlySet<string>>(() => new Set());
  const [edits, setEdits] = useState<Map<string, string[]>>(() => new Map());

  useEffect(() => {
    setReverted(new Set<string>());
    setEdits(new Map());
  }, [before, after]);

  const effective = useMemo(() => recompose(diff.blocks, reverted, edits), [diff, reverted, edits]);
  const stats = useMemo(() => changeStats(diff.blocks, reverted), [diff, reverted]);

  const toggle = useCallback((id: string) => {
    setReverted(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleEdit = useCallback(
    (blockId: string, lineIndex: number, text: string) => {
      setEdits(prev => {
        const block = diff.blocks.find(
          candidate => candidate.kind === 'change' && candidate.id === blockId,
        );
        if (block === undefined || block.kind !== 'change') {
          return prev;
        }
        const base = prev.get(blockId) ?? block.added;
        const next = base.slice();
        next[lineIndex] = text;
        const map = new Map(prev);
        map.set(blockId, next);
        return map;
      });
    },
    [diff.blocks],
  );

  const hasChanges = diff.changeCount > 0;

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        showClose={false}
        onEscapeKeyDown={event => event.preventDefault()}
        onInteractOutside={event => event.preventDefault()}
        className="glass-control-opaque flex h-[85vh] w-[calc(100vw-2rem)] max-w-5xl flex-col gap-0 p-0"
      >
        <DialogHeader className="border-b border-border/50 px-6 pt-6 pb-4">
          <DialogTitle>{t('editor.reviewTitle')}</DialogTitle>
          <DialogDescription asChild>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {hasChanges ? (
                <>
                  <span>{t('editor.reviewStatChanges', { count: stats.total })}</span>
                  <span className="text-emerald-600 dark:text-emerald-400">
                    +{stats.addedLines}
                  </span>
                  <span className="text-red-600 dark:text-red-400">−{stats.removedLines}</span>
                  {stats.reverted > 0 && (
                    <span className="text-muted-foreground">
                      {t('editor.reviewStatReverted', { count: stats.reverted })}
                    </span>
                  )}
                </>
              ) : (
                <span>{t('editor.reviewNoChanges')}</span>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 border-b border-border/50 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
          <span className="px-6 py-2">{t('editor.reviewBefore')}</span>
          <span className="border-l border-border/50 px-6 py-2">
            {t('editor.reviewAfter')}
            {hasChanges && (
              <span className="ml-2 font-normal normal-case text-muted-foreground/70">
                {t('editor.reviewEditHint')}
              </span>
            )}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-background/70">
          {hasChanges ? (
            <ReviewDiffView
              blocks={diff.blocks}
              reverted={reverted}
              edited={edits}
              onToggle={toggle}
              onEdit={handleEdit}
              contextBefore={context?.before}
              contextAfter={context?.after}
              firstLineNo={context?.startLine}
              afterContextStartLine={
                context === undefined ? undefined : context.startLine + countLines(before)
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
              {t('editor.reviewNoChanges')}
            </div>
          )}
        </div>

        <DialogFooter className="items-center border-t border-border/50 px-6 py-4 sm:justify-between">
          <span className="text-xs text-muted-foreground">{t('editor.reviewDirtyHint')}</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="glass" size="sm" onClick={() => onClose(before)}>
              {t('editor.reviewRejectAll')}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => onClose(effective)}
              disabled={!hasChanges}
            >
              {t('editor.reviewClose')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
