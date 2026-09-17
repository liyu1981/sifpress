# selection-revision-plan.md — revise an editor selection with the AI assistant

> Status: **plan only** (research done, no code). Companion to
> `plan/pi-web-agent-plan.md` and `plan/mcp-support-plan.md`.

Scope: let the user select a chunk of text in the editor and ask the AI
assistant to rewrite *only that selection* with an instruction; the result is
reviewed in the existing diff dialog and, on accept, replaces just the selected
range.

---

## 1. UX

1. The user selects text in the Milkdown editor. The selection is **snapped to
   whole blocks** (no partial blocks) — see §5.
2. A small floating **“Revise with AI”** button appears next to the selection
   (plus a keyboard shortcut, e.g. `⌘J` / `Ctrl+J`).
3. Clicking it opens the agent panel (the `AgentChat` bottom sheet) and shows a
   **selection chip** in the composer: `Revising selection · N chars · ✕`.
   The selected markdown is **read-only context** — it is never edited in the
   composer.
4. The user types an **additional instruction** (“make this more concise”,
   “translate to Chinese”, “turn into a table”) and sends; the instruction is
   appended to the fixed selection, not a rewrite of it.
5. The assistant calls the new `update_selection` tool with the revised
   markdown.
6. The existing **review dialog** opens, diffing *the selection text* before vs
   after (per-change undo and inline editing already work).
7. **Done Review** replaces only the selected range in the editor; **Reject
   all** leaves the document untouched.

If there is no selection, the agent falls back to the existing whole-document
`update_content` tool.

---

## 2. What already exists (reusable)

- **Review flow**: `update_content` only *stages* a proposal
  (`pendingProposalRef`), the review dialog diffs baseline→proposal, and
  `handleReviewClose` writes the chosen result. The dialog itself
  (`ReviewChangesDialog` + `ReviewDiffView` + `lib/diff/blocks.ts`) is
  content-agnostic — it just needs `before`/`after` strings, so a selection
  diff needs no changes there.
- **Agent tools**: `admin_ui/src/lib/agent/tools.ts`; the bridge
  (`editor-mutations.ts`) is the only channel from tools into the editor.
- **Editor handle**: `MilkdownEditorHandle` exposes `getMarkdown`,
  `setMarkdown`, `closePopups`, and reaches ProseMirror via
  `builderRef.current.editor.action(ctx => …)`.

---

## 3. Technical findings (verified in the installed packages)

- `Editor.action: <T>((ctx: Ctx) => T) => T` — runs synchronously and returns
  the callback value (used already for `setMarkdownContent`).
- `editorViewCtx` (`@milkdown/kit/core`) → the ProseMirror `EditorView`.
  `view.state.selection` gives `{ from, to, empty }` (document positions).
- `serializerCtx` is exported by `@milkdown/kit/core` and is
  `Serializer = (content: Node) => string`.
- `parserCtx` is `Parser = (text: string) => Node`.
- So a selection can be captured by **slicing the ProseMirror doc and
  serializing it**, with no manual markdown-offset math:

```ts
builder.editor.action(ctx => {
  const view = ctx.get(editorViewCtx);
  const serializer = ctx.get(serializerCtx);
  const { from, to } = view.state.selection;
  if (from === to) return null;
  const slice = view.state.doc.slice(from, to);
  const topNode = view.state.schema.topNodeType.create(null, slice.content);
  return { from, to, markdown: serializer(topNode) };
});
```

When the raw selection is not block-aligned, `getSelection` **expands `from/to`
outwards to the enclosing block boundaries** before slicing, so a selection
that starts mid-paragraph or ends inside a list item snaps to whole blocks.

- And applied by parsing the revised markdown and replacing the range:

```ts
const parser = ctx.get(parserCtx);
const doc = parser(escapeTableCodePipes(revised));
view.dispatch(view.state.tr.replaceWith(from, to, doc.content));
```

- ProseMirror `view.coordsAtPos(pos)` gives the viewport rect for the floating
  button; a `selectionchange` listener (scoped to the editor DOM) detects
  selection changes.

---

## 4. Design

### 4.1 Editor handle additions (`admin_ui/src/lib/md-editor/editor.tsx`)

```ts
export interface EditorSelection {
  from: number;
  to: number;
  markdown: string;
}

interface MilkdownEditorHandle {
  // …existing…
  getSelection: () => EditorSelection | null;
  /** Replace a captured range (or the live selection) with markdown. */
  applyToSelection: (markdown: string, range?: { from: number; to: number }) => boolean;
  /** Viewport rect for positioning the floating action button. */
  getSelectionRect: () => { top: number; left: number; bottom: number } | null;
}
```

- `getSelection` uses the slice+serialize sketch above.
- `applyToSelection` parses and replaces; it must handle the **inline vs block**
  case (see §5).
- All wrapped in `builder.editor.action(...)` so they run against the live ctx.

### 4.2 Bridge additions (`lib/agent/editor-mutations.ts`)

```ts
interface EditorMutationBridge {
  // …existing…
  getSelection: () => { markdown: string; from: number; to: number } | null;
  /** Stage a selection-scoped proposal; opens the review like setContent. */
  updateSelection: (markdown: string, from: number, to: number) => void;
}
```

- The bridge keeps `pendingProposalRef` for whole-document edits and a new
  `pendingSelectionRef: { from, to, before } | null` for selection edits.
- `updateSelection`: if no pending selection, capture `before` from the live
  selection; store `{ from, to, before, proposal }`.
- `openReview` branches: selection review diffs `before → proposal` (the
  selection text); whole-document review is unchanged.
- `handleReviewClose(result)` branches:
  - selection → `editorRef.current.applyToSelection(result, { from, to })`, then
    refresh `body`/`sourceBody` from `getMarkdown()`;
  - whole doc → `writeEditorContent(result)` (as today).

### 4.3 Agent tools (`lib/agent/tools.ts`)

- **`get_selection`** — returns the current selection as markdown, or “no
  selection”. Lets the model read what the user is pointing at.
- **`update_selection`** — parameters `{ content_md: string }`; calls
  `bridge.updateSelection(content_md)` for the captured range. Errors if there
  is no selection (the model is told to fall back to `update_content`).
- Update the system prompt / tool descriptions: “When the user has a selection
  and asks to revise it, read it with `get_selection` and return the full
  revised markdown with `update_selection`; otherwise use `update_content`.”

### 4.4 Selection context for the agent

Two complementary mechanisms (both cheap):

1. **Composer chip** — when the user clicks “Revise with AI”, `editor.tsx`
   captures the selection and passes it to `AgentChat`; the composer shows the
   chip and the first message is annotated with the selection (or the chip
   just tells the model a selection is active).
2. **`get_selection` tool** — the model can re-read the live selection at any
   point (e.g. after the user changes it).

### 4.5 Review integration

No changes to `ReviewChangesDialog` / `ReviewDiffView`: a selection review is
just a `buildDiff(selectedBefore, selectedAfter)` with the same per-change undo
and inline editing. The editor decides how to apply the result.

### 4.6 UI affordances

- **Floating button**: rendered by `MilkdownEditor` (or `EditorPage` via
  `getSelectionRect`) at the selection, `position: fixed`, hidden when the
  selection is empty or the editor loses focus. Uses the glass button variant.
- **Shortcut**: `⌘J` / `Ctrl+J` (avoid `⌘K`, often reserved).
- **Composer chip** with a clear (✕) affordance.
- **Empty-selection guard**: the button/shortcut no-ops with a hint if nothing
  is selected.

---

## 5. Edge cases & risks

- **Inline vs block replacement.** `tr.replaceWith(from, to, doc.content)`
  works for block ranges; a selection *inside* a paragraph needs the parsed
  doc's inline content instead of its block content:
  `doc.content.firstChild?.content`. Detect via
  `view.state.doc.resolve(from).parent.inlineContent`. v1 can also restrict to
  selections that start/end on block boundaries and show a hint otherwise.
- **No partial blocks (locked).** Selections are expanded to whole
  block boundaries before capture, so the slice never cuts a list/table in
  half. Because the range is block-aligned, the replacement is a plain block
  swap (`tr.replaceWith(from, to, doc.content)`) — the inline-coercion path is
  not needed.
- **Stale positions.** If the document changes between capture and apply (the
  user edits while the agent runs), `from/to` can point at the wrong place.
  Mitigations: the review dialog is modal (blocks edits while open); track a
  ProseMirror `Mapping` if we ever allow edits mid-flight; last-resort fallback
  is to search for the captured `before` text or abort with a message.
- **Undo.** Replacing via a transaction adds to ProseMirror history, so `⌘Z`
  restores the selection — good.
- **Markdown round-trip.** The slice serializer is the same one used for the
  whole document, so tables/code/directives round-trip; custom nodes (mermaid,
  image directives) should be checked for their `toMarkdown` behaviour in a
  slice.
- **Source tab.** While the editor is on the markdown source tab (plain
  `<textarea>`), there is no ProseMirror selection — the feature should be
  hidden/disabled then.
- **Multiple selections / cross-block spans** are not supported in v1.

---

## 6. Phased plan

**Phase 1 — capture + replace plumbing**
- [ ] `getSelection` (with **block-boundary snapping**) / `applyToSelection` on
      `MilkdownEditorHandle`.
- [ ] Bridge `getSelection` + `updateSelection`; selection-scoped review state
      and `handleReviewClose` branch.
- [ ] `get_selection` + `update_selection` agent tools; prompt updates.

**Phase 2 — UX**
- [ ] Floating “Revise with AI” button + `⌘J`.
- [ ] Composer selection chip (read-only selection + instruction input);
      auto-open the panel on trigger.
- [ ] i18n (en/zh).

**Phase 3 — polish**
- [ ] Source-tab disable, multi-block/table edges, stale-position fallback.
- [ ] Optional: “revise and replace without review” for trusted prompts.

---

## 7. Decisions (locked)

1. **Trigger**: floating **“Revise with AI”** button next to the selection
   (keyboard `⌘J` / `Ctrl+J` as a shortcut).
2. **No partial blocks**: the selection is snapped outwards to whole block
   boundaries; block-aligned replacement only.
3. **No editing the selected markdown**: the selection is fixed, read-only
   context. The user's chat message is an *additional instruction* applied to
   it.
4. Inline-vs-block coercion is therefore unnecessary — selections are always
   whole blocks and the proposal replaces them as blocks.
