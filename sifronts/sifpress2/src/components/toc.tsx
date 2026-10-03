import type { RefObject } from 'react';
import { useEffect, useLayoutEffect, useState } from 'react';

export interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

/** Headings are collected after markdown renders, so re-scan on DOM changes. */
export function useArticleHeadings(
  rootRef: RefObject<HTMLElement | null>,
  ready: boolean,
): TocItem[] {
  const [items, setItems] = useState<TocItem[]>([]);

  useLayoutEffect(() => {
    if (!ready) {
      setItems([]);
      return;
    }

    const root = rootRef.current;

    if (!root) {
      return;
    }

    let lastKey = '';

    const scan = (): void => {
      const nodes = Array.from(root.querySelectorAll<HTMLElement>('h2[id], h3[id]'));
      const key = nodes.map(el => `${el.tagName}#${el.id}:${el.textContent ?? ''}`).join('|');

      if (key === lastKey) {
        return;
      }

      lastKey = key;

      setItems(
        nodes.map(el => ({
          id: el.id,
          text: el.textContent ?? '',
          level: el.tagName === 'H2' ? 2 : 3,
        })),
      );
    };

    scan();

    const observer = new MutationObserver(scan);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      setItems([]);
    };
  }, [rootRef, ready]);

  return items;
}

export function useScrollSpy(items: TocItem[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const ids = items.map(item => item.id);

    const onScroll = (): void => {
      const threshold = 140;
      let current = ids[0];

      for (const id of ids) {
        const el = document.getElementById(id);

        if (el && el.getBoundingClientRect().top <= threshold) {
          current = id;
        }
      }

      setActiveId(current);
    };

    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => window.removeEventListener('scroll', onScroll);
  }, [items]);

  return activeId;
}

export function TableOfContents({
  items,
  activeId,
  label,
}: {
  items: TocItem[];
  activeId: string | null;
  label: string;
}) {
  if (items.length < 2) {
    return null;
  }

  return (
    <nav aria-label={label}>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
        {label}
      </p>
      <ul className="mt-3 space-y-1 border-l border-rule">
        {items.map(item => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={`-ml-px block border-l py-1.5 pr-2 leading-snug transition-colors ${
                item.level === 3 ? 'border-transparent pl-6 text-[13px]' : 'pl-3'
              } ${
                activeId === item.id
                  ? 'border-brand text-ink'
                  : 'border-transparent text-ink-faint hover:text-ink'
              }`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
