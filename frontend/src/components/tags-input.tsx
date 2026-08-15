import { X } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { tagsApi } from '@/lib/pages';
import { cn } from '@/lib/utils';

const MIN_QUERY_LENGTH = 2;

interface TagsInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function TagsInput({ value, onChange, placeholder, className }: TagsInputProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

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

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (trimmedQuery.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const handle = setTimeout(async () => {
      const q = trimmedQuery.toLowerCase();
      const selected = valueRef.current.map(tag => tag.toLowerCase());
      const matches = (await tagsApi.list())
        .map(tag => tag.name)
        .filter(name => name.toLowerCase().includes(q))
        .filter(name => !selected.includes(name.toLowerCase()));

      setSuggestions(matches);
      setHighlight(0);
      setOpen(matches.length > 0);
    }, 180);

    return () => clearTimeout(handle);
  }, [trimmedQuery]);

  const addTag = useCallback(
    (raw: string) => {
      const tag = raw.trim();
      if (tag === '') {
        return;
      }
      const exists = valueRef.current.some(v => v.toLowerCase() === tag.toLowerCase());
      if (!exists) {
        onChange([...valueRef.current, tag]);
      }
      setQuery('');
      setOpen(false);
      setHighlight(0);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(value.filter(v => v !== tag));
    },
    [value, onChange],
  );

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === ' ' || event.key === ',') {
      event.preventDefault();
      addTag(query);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      addTag(open && suggestions[highlight] !== undefined ? suggestions[highlight] : query);
      return;
    }

    if (event.key === 'ArrowDown' && open) {
      event.preventDefault();
      setHighlight(index => Math.min(index + 1, suggestions.length - 1));
      return;
    }

    if (event.key === 'ArrowUp' && open) {
      event.preventDefault();
      setHighlight(index => Math.max(index - 1, 0));
      return;
    }

    if (event.key === 'Backspace' && query === '' && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <Popover open={open} onOpenChange={next => setOpen(next && suggestions.length > 0)}>
      <PopoverAnchor asChild>
        <div
          ref={anchorRef}
          className={cn(
            'flex min-h-8 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-transparent px-2 py-1.5 transition-colors outline-none focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
            className,
          )}
        >
          {value.map(tag => (
            <Badge key={tag} variant="secondary" className="gap-1 py-0 pr-1 pl-2">
              {tag}
              <button
                type="button"
                onClick={() => removeTag(tag)}
                aria-label={`${t('editor.removeTag')} ${tag}`}
                className="rounded-full p-0.5 transition-colors hover:bg-muted-foreground/20"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => {
              if (trimmedQuery.length >= MIN_QUERY_LENGTH && suggestions.length > 0) {
                setOpen(true);
              }
            }}
            placeholder={value.length === 0 ? placeholder : ''}
            aria-label={t('editor.tagsField')}
            className="min-w-24 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
      </PopoverAnchor>

      <PopoverContent align="start" sideOffset={6} className="p-1" style={{ width }}>
        <ul role="listbox" className="max-h-56 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <li key={suggestion}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                onClick={() => addTag(suggestion)}
                onMouseEnter={() => setHighlight(index)}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                  index === highlight ? 'bg-accent text-accent-foreground' : 'text-foreground',
                )}
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
