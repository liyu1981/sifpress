import { useEffect, useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

export interface TocItem {
  id: string
  text: string
  level: 2 | 3
}

export function useArticleHeadings(
  rootRef: RefObject<HTMLElement | null>,
  ready: boolean,
): TocItem[] {
  const [items, setItems] = useState<TocItem[]>([])

  useLayoutEffect(() => {
    if (!ready) {
      setItems([])
      return
    }

    const root = rootRef.current

    if (!root) {
      return
    }

    const nodes = Array.from(root.querySelectorAll<HTMLElement>('h2[id], h3[id]'))

    setItems(
      nodes.map((el) => ({
        id: el.id,
        text: el.textContent ?? '',
        level: el.tagName === 'H2' ? 2 : 3,
      })),
    )
  }, [rootRef, ready])

  return items
}

export function useScrollSpy(items: TocItem[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null)

  useEffect(() => {
    if (items.length === 0) {
      return
    }

    const ids = items.map((item) => item.id)

    const onScroll = (): void => {
      const threshold = 120
      let current = ids[0]

      for (const id of ids) {
        const el = document.getElementById(id)

        if (el && el.getBoundingClientRect().top <= threshold) {
          current = id
        }
      }

      setActiveId(current)
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => window.removeEventListener('scroll', onScroll)
  }, [items])

  return activeId
}

export function TableOfContents({
  items,
  activeId,
  label,
}: {
  items: TocItem[]
  activeId: string | null
  label: string
}) {
  if (items.length < 2) {
    return null
  }

  return (
    <nav aria-label={label} className="text-sm">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <ul className="space-y-1 border-l border-border">
        {items.map((item) => (
          <li key={item.id} className={item.level === 3 ? 'pl-4' : 'pl-0'}>
            <a
              href={`#${item.id}`}
              className={`block border-l-2 -ml-px px-2 py-1 leading-snug transition-colors ${
                activeId === item.id
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
