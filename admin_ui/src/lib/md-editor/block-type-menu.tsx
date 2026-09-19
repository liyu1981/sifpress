import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

export interface BlockTypeOption {
  label: string;
  short: string;
  level: number | null;
}

export const BLOCK_TYPE_OPTIONS: BlockTypeOption[] = [
  { label: 'Paragraph', short: 'T', level: null },
  { label: 'Heading 1', short: 'H1', level: 1 },
  { label: 'Heading 2', short: 'H2', level: 2 },
  { label: 'Heading 3', short: 'H3', level: 3 },
  { label: 'Heading 4', short: 'H4', level: 4 },
  { label: 'Heading 5', short: 'H5', level: 5 },
  { label: 'Heading 6', short: 'H6', level: 6 },
];

interface BlockTypeMenuProps {
  /** Trigger button rect, in viewport coordinates. */
  rect: DOMRect;
  currentLevel: number | null;
  onSelect: (level: number | null) => void;
  onClose: () => void;
}

/**
 * Dropdown for the floating selection toolbar. Crepe's `ToolbarItem` can only
 * render icon buttons, so the trigger opens this portal-rendered menu instead
 * of a native selector. The trigger keeps editor focus (pointerdown is
 * prevented by Crepe), and the items prevent default too, so the ProseMirror
 * selection survives until the command runs.
 */
export function BlockTypeMenu({ rect, currentLevel, onSelect, onClose }: BlockTypeMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-toolbar-item="block-type"]')) {
        return;
      }
      if (ref.current !== null && target !== null && ref.current.contains(target)) {
        return;
      }
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onClose, true);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onClose, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const width = 176;
  const estimatedHeight = BLOCK_TYPE_OPTIONS.length * 32 + 8;
  const openUp =
    rect.bottom + estimatedHeight > window.innerHeight && rect.top - estimatedHeight > 0;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const top = openUp ? rect.top - estimatedHeight - 6 : rect.bottom + 6;

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Block type"
      className="fixed z-50 overflow-hidden rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      style={{ top, left, width }}
    >
      {BLOCK_TYPE_OPTIONS.map(option => (
        <button
          key={option.short}
          type="button"
          role="menuitem"
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground',
            currentLevel === option.level && 'bg-accent/60 font-medium',
          )}
          onMouseDown={event => event.preventDefault()}
          onClick={() => onSelect(option.level)}
        >
          <span className="grid w-6 shrink-0 place-items-center text-xs font-semibold text-muted-foreground">
            {option.short}
          </span>
          {option.label}
        </button>
      ))}
    </div>
  );
}
