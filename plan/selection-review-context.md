# selection-review-context.md — show document context in the selection review dialog

> Status: **implemented**. Companion to `plan/selection-revision-plan.md`,
> `plan/review-changes-mode.md`, `plan/agent-composer-redesign.md`.

## 1. Problem

The selection-revision flow stages only the selection:

- `editorBridge.updateSelection(markdown)` stores `selectionRangeRef` +
  `pendingSelectionRef` (`admin_ui/src/pages/editor.tsx`).
- `openReview()` (selection branch) calls
  `setReview({ before: range.markdown, after: pendingSelection })`.
- `ReviewChangesDialog` diffs **only those two strings**
  (`buildDiff(before, after)` in `admin_ui/src/lib/diff/blocks.ts`).

So the dialog shows the clamped selection and its rewrite floating in
isolation — no heading, no preceding/following paragraph, no line numbers that
match the document. Reverting/editing and "Close review" still apply correctly
to the selection range, but the reviewer cannot tell where the chunk sits.

## 2. Goal / UX

In the review dialog for a **selection** revision, show read-only surrounding
document lines above and below the changed region, so the user can read the
rewrite in place:

```
┌ Current                    │ Assistant Proposed ─────────────┐
│ 42  ## Pluto After...       │ 42  ## Pluto After...           │  ← context (above, dimmed)
│ 43  The flyby also ...      │ 43  The flyby also ...          │
│────────────────────── Selection · 4 changes ────────────────│
│ 44  The Pluto System...     │ 44  * The Pluto System...       │  ← diff (red/green, editable)
│ 45  The New Horizons...     │ 45  * The New Horizons...       │
│──────────────────────────────────────────────────────────────│
│ 46  ...                     │ 46  ...                          │  ← context (below, dimmed)
└──────────────────────────────────────────────────────────────┘
```

Requirements:

- Context is **display-only**. It must never enter `recompose()`/`effective`,
  so the result applied to the selection stays exactly the revised selection
  text.
- Line numbers continue from the real document position.
- Long documents: clamp context (e.g. 8 lines per side) with an
  expand/collapse control, reusing the existing pattern.
- The whole-document review path is unchanged.

## 3. Recommended approach — read-only context rows (not part of the diff)

Keep the selection-only diff (safe, already correct for recompose) and add a
separate, read-only context chrome around it.

### 3.1 Capture context in the editor

`admin_ui/src/lib/md-editor/editor.tsx` — extend `MilkdownEditorHandle`:

```ts
export interface EditorSelectionContext {
  /** Serialized lines of top-level blocks immediately before the selection. */
  before: string[];
  /** Serialized lines of top-level blocks immediately after the selection. */
  after: string[];
  /** 1-based document line number of the selection's first line. */
  startLine: number;
}

getSelectionContext: (maxLines?: number) => EditorSelectionContext | null;
```

Implementation notes (mirror `getSelection`, lines ~105–131):

- Resolve `$from`/`$to` and their **top-level child indices** (depth-1).
- Walk sibling indices outward up to `maxLines` serialized lines:
  - build a `Fragment` slice over those top-level children,
  - wrap with `schema.topNodeType.create(null, slice.content)`,
  - `serializer(topNode).split('\n')`.
- `startLine` = `serializer(<topNode of all children before the selection>).split('\n').length`
  (number of lines before the first selected line), or count newlines in the
  serialized preceding prefix. Compute alongside the `before` walk.
- Do not mutate the document; return `null` when there is no selection.
- Export `EditorSelectionContext` from `admin_ui/src/lib/md-editor/index.ts`.

`maxLines` default: ~8 (a module constant, e.g. `SELECTION_CONTEXT_LINES`).

### 3.2 Carry context through review state

`admin_ui/src/pages/editor.tsx`:

- Widen state:
  ```ts
  const [review, setReview] = useState<{
    before: string;
    after: string;
    context?: EditorSelectionContext;
  } | null>(null);
  ```
- In `openReview()` selection branch, capture once:
  ```ts
  setReview({
    before: range.markdown,
    after: pendingSelection,
    context: editorRef.current?.getSelectionContext() ?? undefined,
  });
  ```
- Document branch leaves `context` undefined.
- Pass `context={review.context}` to `<ReviewChangesDialog>`.

### 3.3 Plumb through the dialog

`admin_ui/src/components/review-changes-dialog.tsx`:

- Add `context?: EditorSelectionContext` to props.
- Forward `contextBefore`, `contextAfter`, `contextStartLine` to
  `ReviewDiffView`.
- Everything else (diff, revert, inline edit, `effective`, `onClose`) is
  unchanged — this is the key safety property.

### 3.4 Render context in the diff view

`admin_ui/src/components/review-diff-view.tsx`:

- New optional props: `contextBefore?: string[]`, `contextAfter?: string[]`,
  `contextStartLine?: number`.
- Add a `firstLineNo` offset so `buildRows` initializes `leftNo`/`rightNo` from
  `contextStartLine ?? 1` (keeps numbers aligned with the document). Add it as
  an argument with a default of `1`.
- Render **full-width single-column** muted rows above and below the two-column
  diff (context is identical both sides, so duplicating it adds no value and a
  full-width band reads as "unchanged surroundings"):
  - above: the tail of `contextBefore`, line numbers
    `startLine - shown .. startLine - 1`, dimmed (`text-muted-foreground`),
    monospace; if there are more lines, a leading expand row
    ("… N unchanged lines above").
  - a divider between context and the diff labeled
    `t('editor.reviewSelectionRegion')` (e.g. "Selection · N changes"), so the
    editable region is unmistakable.
  - below: the head of `contextAfter`, line numbers
    `startLine + beforeLines ..`, with a trailing expand row.
- Reuse the existing collapsed/expand state pattern (`expanded` set +
  `CONTEXT_LINES` clamp); no changes to `buildRows`' change logic.
- **Invariant**: `contextBefore/After` are never added to `blocks`, so
  `recompose`, `changeStats`, toggle, and inline edit are unaffected.

### 3.5 i18n

`admin_ui/src/lib/i18n.ts` (en ~line 239, zh ~line 861), add:

- `reviewSelectionRegion`: `'Selection · {{count}} change(s)'` / `'选区 · {{count}} 处修改'`
- `reviewContextAbove`: `'…{{count}} unchanged line(s) above'` / `'上方还有 {{count}} 行未修改内容'`
- `reviewContextBelow`: `'…{{count}} unchanged line(s) below'` / `'下方还有 {{count}} 行未修改内容'`

## 4. Edge cases

- Selection at the very start/end of the document → one side is empty; hide
  that side.
- Long context → clamped with expand; default 8 lines per side.
- Document review (`update_content`) → `context` undefined; identical to
  today.
- Revision-history preview (`ReviewDiffView blocks readOnly`, editor line
  ~270) → no context props; unchanged.
- Context is frozen at staging time; the dialog is modal, so the document
  cannot shift underneath it.
- `applyToSelection` still uses the captured `{ from, to }` range; context
  capture never changes those positions.

## 5. Alternatives considered

1. **Full-document diff** (`docBefore` vs `docWithSelectionReplaced`). Gives
   real context for free, but `recompose` would return the whole document; the
   selection splice would have to be re-derived on every inline edit, and
   "Close review" would have to write the whole document instead of the
   selection range. Riskier and slower. Rejected.
2. **Third read-only side panel** with the surrounding document. More chrome,
   worse inline reading than context rows; rejected.
3. **Pinned nearest heading** in the header ("in section: ## …"). Nice
   enhancement; can be layered on later by walking `contextBefore` backwards
   for the nearest heading. Not required for v1.

## 6. Files touched

- `admin_ui/src/lib/md-editor/editor.tsx` — `getSelectionContext` handle method
  + `EditorSelectionContext` type.
- `admin_ui/src/lib/md-editor/index.ts` — export the type.
- `admin_ui/src/pages/editor.tsx` — capture context, widen `review` state, pass
  prop.
- `admin_ui/src/components/review-changes-dialog.tsx` — forward context props.
- `admin_ui/src/components/review-diff-view.tsx` — render context bands +
  line-number offset.
- `admin_ui/src/lib/i18n.ts` — labels (en + zh).

## 7. Verification

- `cd admin_ui && pnpm run format && pnpm run typecheck`.
- `php build.php`.
- Code inspection / reasoning (no browser available):
  - selection revision → dialog shows context bands and document-aligned line
    numbers; diff region editable, context not;
  - revert-all + close → `onClose(before)` still yields the original selection
    (context never leaks into `effective`);
  - whole-document review and revision-history preview visually unchanged.
