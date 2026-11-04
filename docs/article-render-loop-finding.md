# Finding — Article page-detail render loop (infinite reload)

**Status**: fixed — both links of the loop broken (see [Fix applied](#fix-applied))
**Introduced by**: `f3bcda6` ("feat(article, editor): author avatar byline, TOC re-scan,
media asset browser")
**Files involved**: `frontend/src/components/markdown/toc.tsx`,
`frontend/src/lib/marked/view.tsx`, `frontend/src/pages/article-detail.tsx`

---

## Symptom

On the article detail page the content reloads infinitely — the markdown render
pipeline keeps re-running (`console.log(next)` in `MarkdownView`'s effect fires
repeatedly) and the article flickers.

**Bisect result**: removing `setHtml(next)` in `frontend/src/lib/marked/view.tsx`
eliminates the loop. It is *not* a `postProcessHtml` problem — any non-empty HTML
triggers it.

---

## Root cause

A feedback loop between two links:

```
setHtml(next)
  → React re-renders MarkdownView
  → React commits: re-writes the .prose div's innerHTML          (①)
  → MutationObserver in useArticleHeadings fires                  (②)
  → scan() → setItems([...new array])                            (③)
  → ArticleDetailPage re-renders
  → MarkdownView re-renders (no memo)
  → back to ① …
```

Neither link loops on its own; together they are unbounded.

### ① React 19 rewrites `dangerouslySetInnerHTML` on every re-render

`MarkdownView` renders `dangerouslySetInnerHTML={{ __html: html }}`
(`frontend/src/lib/marked/view.tsx:73`). The `{ __html }` literal is a fresh
object every render. React 19's DOM diff is reference-based, so the prop is
considered "changed" every commit and the inner HTML is re-parsed + re-inserted:

- `completeWork` case 5 marks the Update flag on plain object-reference
  inequality — `current.memoizedProps !== newProps && markUpdate(...)`
  (`react-dom-client.development.js`).
- `updateProperties` then compares the `dangerouslySetInnerHTML` prop by object
  reference (`_propKey8 === propKey`) and `setProp`'s `dangerouslySetInnerHTML`
  case unconditionally executes `domElement.innerHTML = key` — it never compares
  the previous `__html` value.

So **every** re-render of `MarkdownView` produces a real DOM mutation (children
removed + re-added), even when the HTML string is byte-identical. (This is the
same known behavior behind video/iframe restarts or focus loss on unrelated
re-renders with `dangerouslySetInnerHTML`.)

### ② `useArticleHeadings` re-renders the page on every mutation of the content

`useArticleHeadings` (`frontend/src/components/markdown/toc.tsx`) attaches a
`MutationObserver` on `contentRef` with `{ childList: true, subtree: true }` — the
exact subtree `MarkdownView` mutates. Its `scan()` always calls
`setItems(nodes.map(...))` with a **brand-new array**, even when the headings are
unchanged, so every mutation forces a page re-render.

### Why the bisects line up

- **Without `setHtml`**: `html` stays `''`; `innerHTML = ''` on an already-empty
  element is a DOM no-op, so no mutation fires and the observer never re-renders
  the page.
- **Not the postprocess**: the loop is driven by the fact that *some* HTML is
  inserted, not by what that HTML contains.

---

## Fixes

### Primary — break link ② (the actual trigger)

Make `scan()` in `useArticleHeadings` bail when the scanned headings are
unchanged (compare by `id`/`text`/`level` signature before calling `setItems`).
The first innerHTML rewrite still triggers one `setItems`, but the resulting page
re-render no longer causes further rewrites/mutations, so the loop terminates.

### Defense-in-depth — break link ①

Stop re-inserting the article HTML on unrelated re-renders:

- Wrap `MarkdownView` in `React.memo` — its props are referentially stable
  (`content` string, `className` literal, stable `containerRef`), so page
  re-renders skip the component entirely; or
- hoist a stable `dangerouslySetInnerHTML` object (e.g. build `{ __html: html }`
  once and keep it in state) so the reference comparison passes.

This also fixes the side effects of innerHTML re-insertion (video/iframe restart,
editor focus loss) on any re-render.

## Fix applied

Both approaches were implemented:

1. **`frontend/src/components/markdown/toc.tsx`** — `scan()` now keeps a
   `lastKey` signature (`tagName#id:text`) in a closure and returns early when
   the headings are unchanged, so observer callbacks no longer schedule page
   re-renders for identical TOCs.
2. **`frontend/src/lib/marked/view.tsx`** — `MarkdownView` is wrapped in
   `React.memo` (props are referentially stable), so `ArticleDetailPage`
   re-renders skip it and React never re-inserts the article HTML. Also restored
   `setHtml(next)` (was disabled during debugging) and removed the debug
   `console.log(next)`.

Verified with `pnpm run format`, `pnpm run typecheck`, and `pnpm run build`.

---

## References

- `frontend/src/lib/marked/view.tsx:31-52` — the effect that calls `setHtml`.
- `frontend/src/components/markdown/toc.tsx:28-45` — `scan()` + observer.
- `frontend/src/pages/article-detail.tsx:203-208` — `contentRef` wrapping
  `MarkdownView`.
- React 19.2.8 `react-dom-client.development.js`: `completeWork` case 5
  (Update-flag decision), `updateProperties` generic loop (reference compare),
  `setProp` `dangerouslySetInnerHTML` case (unconditional `innerHTML` write).
