import { ChevronsUpDown, Redo2, Undo2 } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addedFor, type ChangeEdits, type DiffBlock } from '@/lib/diff/blocks';
import { cn } from '@/lib/utils';

const CONTEXT_LINES = 4;

type ChangeType = 'added' | 'removed' | 'changed';

interface LineRow {
  kind: 'line';
  key: string;
  leftNo: number | null;
  leftText: string;
  rightNo: number | null;
  rightText: string;
  changeId?: string;
  changeType?: ChangeType;
  changeIndex?: number;
  showToggle?: boolean;
}

interface CollapsedRow {
  kind: 'collapsed';
  key: string;
  contextId: string;
  hidden: number;
}

type Row = LineRow | CollapsedRow;

function contextRow(leftNo: number, rightNo: number, text: string): LineRow {
  return {
    kind: 'line',
    key: `ctx-${leftNo}`,
    leftNo,
    rightNo,
    leftText: text,
    rightText: text,
  };
}

function buildRows(blocks: DiffBlock[], expanded: ReadonlySet<string>, edited: ChangeEdits): Row[] {
  const rows: Row[] = [];
  let leftNo = 1;
  let rightNo = 1;
  let contextIndex = 0;

  for (const block of blocks) {
    if (block.kind === 'context') {
      const contextId = `ctx${contextIndex++}`;
      const { lines } = block;
      const hidden = lines.length - CONTEXT_LINES * 2;

      if (hidden > 0 && !expanded.has(contextId)) {
        for (let i = 0; i < CONTEXT_LINES; i++) {
          rows.push(contextRow(leftNo++, rightNo++, lines[i]));
        }
        rows.push({ kind: 'collapsed', key: contextId, contextId, hidden });
        for (let i = lines.length - CONTEXT_LINES; i < lines.length; i++) {
          rows.push(contextRow(leftNo++, rightNo++, lines[i]));
        }
      } else {
        for (const line of lines) {
          rows.push(contextRow(leftNo++, rightNo++, line));
        }
      }
      continue;
    }

    const added = addedFor(block, edited);
    const count = Math.max(block.removed.length, added.length);
    const changeType: ChangeType =
      block.removed.length > 0 && added.length > 0
        ? 'changed'
        : block.removed.length > 0
          ? 'removed'
          : 'added';

    for (let i = 0; i < count; i++) {
      const hasLeft = i < block.removed.length;
      const hasRight = i < added.length;

      rows.push({
        kind: 'line',
        key: `${block.id}-${i}`,
        leftNo: hasLeft ? leftNo++ : null,
        leftText: hasLeft ? block.removed[i] : '',
        rightNo: hasRight ? rightNo++ : null,
        rightText: hasRight ? added[i] : '',
        changeId: block.id,
        changeType,
        changeIndex: hasRight ? i : undefined,
        showToggle: i === 0,
      });
    }
  }

  return rows;
}

function EditableLine({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      rows={1}
      spellCheck={false}
      autoComplete="off"
      aria-label={ariaLabel}
      onChange={event => onChange(event.target.value.replace(/[\r\n]+/g, ' '))}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault();
        }
      }}
      className="m-0 block min-w-0 flex-1 resize-none overflow-hidden rounded-sm border-0 bg-transparent p-0 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-inherit outline-none transition-colors hover:bg-primary/10 focus-visible:bg-primary/15"
    />
  );
}

interface DiffLineCellProps {
  side: 'left' | 'right';
  lineNo: number | null;
  text: string;
  tone: 'context' | 'removed' | 'added';
  reverted: boolean;
  editable?: boolean;
  onChange?: (next: string) => void;
  ariaLabel?: string;
}

function DiffLineCell({
  side,
  lineNo,
  text,
  tone,
  reverted,
  editable = false,
  onChange,
  ariaLabel = '',
}: DiffLineCellProps) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-start gap-2 px-2',
        side === 'right' && 'border-l border-border/50',
        tone === 'removed' && 'bg-red-500/10 text-red-700 dark:text-red-400',
        tone === 'added' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
        reverted && 'opacity-45',
      )}
    >
      <span className="w-9 shrink-0 select-none text-right font-mono text-[10px] leading-5 text-muted-foreground/50 tabular-nums">
        {lineNo ?? ''}
      </span>
      {editable && onChange !== undefined ? (
        <EditableLine value={text} onChange={onChange} ariaLabel={ariaLabel} />
      ) : (
        <span
          className={cn(
            'min-w-0 flex-1 font-mono text-xs leading-5 break-words whitespace-pre-wrap',
            reverted && tone === 'added' && 'line-through',
          )}
        >
          {text === '' ? '\u00a0' : text}
        </span>
      )}
    </div>
  );
}

export interface ReviewDiffViewProps {
  blocks: DiffBlock[];
  reverted: ReadonlySet<string>;
  edited: ChangeEdits;
  onToggle: (id: string) => void;
  onEdit: (blockId: string, lineIndex: number, text: string) => void;
}

export function ReviewDiffView({
  blocks,
  reverted,
  edited,
  onToggle,
  onEdit,
}: ReviewDiffViewProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = useMemo(() => buildRows(blocks, expanded, edited), [blocks, expanded, edited]);

  const expand = (contextId: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.add(contextId);
      return next;
    });

  return (
    <div className="font-mono text-xs">
      {rows.map(row => {
        if (row.kind === 'collapsed') {
          return (
            <button
              key={row.key}
              type="button"
              onClick={() => expand(row.contextId)}
              className="flex w-full items-center justify-center gap-1 bg-muted/60 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-muted"
            >
              <ChevronsUpDown className="size-3" />
              {t('editor.reviewExpandContext', { count: row.hidden })}
            </button>
          );
        }

        const isReverted = row.changeId !== undefined && reverted.has(row.changeId);
        const leftTone =
          row.changeType === 'removed' || row.changeType === 'changed' ? 'removed' : 'context';
        const rightTone =
          row.changeType === 'added' || row.changeType === 'changed' ? 'added' : 'context';
        const canEdit = row.changeId !== undefined && row.changeIndex !== undefined && !isReverted;

        return (
          <div key={row.key} className="relative grid grid-cols-2">
            <DiffLineCell
              side="left"
              lineNo={row.leftNo}
              text={row.leftText}
              tone={leftTone}
              reverted={isReverted}
            />
            <DiffLineCell
              side="right"
              lineNo={row.rightNo}
              text={row.rightText}
              tone={rightTone}
              reverted={isReverted}
              editable={canEdit}
              ariaLabel={t('editor.reviewEditLine')}
              onChange={
                canEdit
                  ? next => onEdit(row.changeId as string, row.changeIndex as number, next)
                  : undefined
              }
            />
            {row.showToggle && row.changeId !== undefined && (
              <button
                type="button"
                onClick={() => onToggle(row.changeId as string)}
                aria-label={
                  isReverted ? t('editor.reviewRestoreChange') : t('editor.reviewUndoChange')
                }
                title={isReverted ? t('editor.reviewRestoreChange') : t('editor.reviewUndoChange')}
                className={cn(
                  'absolute top-0.5 left-1/2 z-10 flex size-5 -translate-x-1/2 items-center justify-center rounded-full border shadow-sm transition-colors',
                  isReverted
                    ? 'border-border bg-background text-muted-foreground hover:bg-muted'
                    : 'border-emerald-500/40 bg-background text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400',
                )}
              >
                {isReverted ? <Redo2 className="size-3" /> : <Undo2 className="size-3" />}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
