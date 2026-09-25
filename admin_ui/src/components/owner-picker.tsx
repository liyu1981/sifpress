import { Loader2 } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { avatarUrl, pagesApi, type PageOwnerCandidate } from 'ui-sdk';
import { cn } from '@/lib/utils';

/** The article's owner as far as the editor knows it (username may be unknown). */
export interface PageOwner {
  id: number;
  name: string;
  username: string;
}

interface OwnerPickerProps {
  owner: PageOwner | null;
  disabled?: boolean;
  onChange: (candidate: PageOwnerCandidate) => void;
}

/**
 * Typeahead for an article's owner. Suggestions come from
 * `pages.ownerCandidates` (active users who can write pages), so the article
 * never lands on someone who cannot maintain it.
 */
export function OwnerPicker({ owner, disabled = false, onChange }: OwnerPickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<PageOwnerCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const anchorRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = anchorRef.current;

    if (el === null) {
      return;
    }

    const update = (): void => setWidth(el.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  const trimmed = query.trim();

  useEffect(() => {
    if (!open || disabled) {
      return;
    }

    let cancelled = false;
    setLoading(true);

    const handle = setTimeout(async () => {
      try {
        const users = await pagesApi.ownerCandidates(trimmed);

        if (!cancelled) {
          setCandidates(users.filter(user => user.id !== owner?.id));
          setHighlight(0);
        }
      } catch {
        if (!cancelled) {
          setCandidates([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [open, trimmed, disabled, owner?.id]);

  const select = (candidate: PageOwnerCandidate): void => {
    onChange(candidate);
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }

    if (event.key === 'ArrowDown' && candidates.length > 0) {
      event.preventDefault();
      setOpen(true);
      setHighlight(index => Math.min(index + 1, candidates.length - 1));
      return;
    }

    if (event.key === 'ArrowUp' && candidates.length > 0) {
      event.preventDefault();
      setHighlight(index => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Enter' && open && candidates[highlight] !== undefined) {
      event.preventDefault();
      select(candidates[highlight]);
    }
  };

  const showList = !disabled && open && (loading || candidates.length > 0 || trimmed !== '');

  return (
    <Popover open={showList} onOpenChange={next => setOpen(next)}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className={cn(
            'flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-input bg-transparent px-2 py-1.5 transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
            disabled && 'opacity-70',
          )}
        >
          {owner !== null && (
            <>
              <img src={avatarUrl(owner.id)} alt="" className="size-6 shrink-0 rounded-full" />
              <span className="shrink-0 text-sm">{owner.name}</span>
              {owner.username !== '' && (
                <span className="shrink-0 text-xs text-muted-foreground">@{owner.username}</span>
              )}
            </>
          )}
          {disabled ? (
            <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
              {owner === null ? t('editor.ownerNone') : ''}
            </span>
          ) : (
            <input
              ref={inputRef}
              value={query}
              onChange={event => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => setOpen(true)}
              placeholder={owner === null ? t('editor.ownerPlaceholder') : t('editor.ownerChange')}
              aria-label={t('editor.ownerTitle')}
              className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent align="start" sideOffset={6} className="p-1" style={{ width }}>
        {loading && candidates.length === 0 ? (
          <div className="flex items-center gap-2 px-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            {t('editor.ownerSearching')}
          </div>
        ) : candidates.length === 0 ? (
          <div className="px-2 py-2 text-sm text-muted-foreground">{t('editor.ownerEmpty')}</div>
        ) : (
          <ul role="listbox" className="max-h-64 overflow-y-auto">
            {candidates.map((candidate, index) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === highlight}
                  onClick={() => select(candidate)}
                  onMouseEnter={() => setHighlight(index)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                    index === highlight ? 'bg-accent text-accent-foreground' : 'text-foreground',
                  )}
                >
                  <img src={candidate.avatar_url} alt="" className="size-6 shrink-0 rounded-full" />
                  <span className="min-w-0 flex-1 truncate">{candidate.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    @{candidate.username}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
