# review-changes-mode.md — AI-assisted edit review dialog

Scope: a **Review changes** mode for the markdown editor. After the in-editor
AI assistant rewrites content, a large dialog opens automatically showing a
**side-by-side before/after diff**, with controls to undo individual changes
before the user commits them with Save.

Related docs: `plan/pi-web-agent-plan.md` (the in-editor agent),
`plan/milkdown-action-plan.md` (editor stack).

---

## 1. Goals

1. **Agent-triggered.** The assistant activates review itself after it edits
   the draft; the user does not have to remember to open anything.
2. **Big side-by-side dialog.** Left = content before the agent edit, right =
   content after. Full markdown, not a formatted preview.
3. **Selective undo.** Keep or revert individual changes (hunks), plus
   "Undo all" / "Keep all".
4. **Non-destructive by default.** Review happens on the *working copy* before
   Save, so rejecting a change is free and no revision is created until the
   user commits. (See §6 for the post-save alternative.)

Non-goals for v1: collaborative multi-user review, comments/approval threads,
diffing binary assets, word-level prose suggestions.

---

## 2. Current state (what already exists)

- `admin_ui/src/pages/editor.tsx` (EditorPage) owns all draft state
  (`title`, `tags`, `body`, `sourceBody`, frontmatter, `commitNote`) and the
  Save mutation (`pagesApi.update` / `pagesApi.create`).
- `admin_ui/src/components/agent/agent-chat.tsx` runs the agent loop
  client-side and passes an `EditorMutationBridge` into
  `buildAgent()` → `buildAgentTools(editor)`.
- `admin_ui/src/lib/agent/tools.ts` exposes `get_content`, `update_content`
  (→ `bridge.setContent`), `get_frontmatter`, `update_frontmatter`,
  `set_commit_note`. They mutate the editor UI only — **the user still clicks
  Save**; this is a deliberate safety property.
- `admin_ui/src/lib/agent/editor-mutations.ts` defines the bridge interface.
- Revisions are server-side: `page_revisions` + `pagesApi.revisions/revision/
  revisionDiff/restoreRevision`; `api.php` already has `line_diff()` returning
  `{type: same|add|remove, content}[]`.
- `editor.tsx` has a small unified `DiffLines` renderer used by the revisions
  tab (capped at 200 lines).
- UI primitives: `radix-ui` (unified) is installed; `alert-dialog` and
  `confirm-dialog` exist, but **there is no generic `dialog.tsx`** yet.
- `diff@8` is already in the dependency graph (transitively via
  pi-agent-core); `react-diff-viewer-continued` is **not** installed.

Nothing in the codebase currently captures a pre-edit baseline, so the first
task is to introduce one.

---

## 3. UX

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Review AI changes                                       3 changes  +12 −4  ✕│
├───────────────────────────────────────────────────────────────────────────┤
│  [Side-by-side] [Unified]        ‹ prev change   2 / 3   next ›             │
├──────────────────────────────┬────────────────────────────────────────────┤
│  Before (saved)              │  After (AI)                                │
│  …context…                   │  …context…                                 │
│  -  Old sentence.        ↩   │  +  New sentence.                          │
│  …context…                   │  …context…                                 │
├──────────────────────────────┴────────────────────────────────────────────┤
│  [Undo all]   [Keep all]                              [Close]  [Save]       │
└───────────────────────────────────────────────────────────────────────────┘
```

- Opens as a near-fullscreen modal (`w-[95vw] max-w-7xl h-[85vh]`), glass
  styling consistent with the rest of the app.
- Diff is over **markdown source**, monospace, preserving whitespace.
- Each hunk has a revert control (↩); reverted hunks are visually muted and
  their lines fall back to the baseline text. Header updates live.
- `Esc` / `✕` / `Close` = keep the current working copy (same as "Keep all").
- `Save` in the footer is a convenience that runs the existing save path.
- Optional: a "Review changes" button in the editor toolbar so a human can
  reopen the last review without the agent.

---

## 4. Architecture / data flow

The review operates on the working copy; no new server endpoint is required.

```
EditorPage state
  ├─ body / sourceBody            current working copy (post-agent)
  ├─ reviewBaselineRef            snapshot captured before the first agent edit
  ├─ rejectedHunks: Set<string>   which changes the user reverted
  └─ reviewOpen: boolean

agent tool update_content ──► bridge.setContent(md)
                                 │  if reviewBaselineRef == null:
                                 │      reviewBaselineRef = current markdown
                                 └─► setMarkdown(md) + mark reviewDirty

AgentChat on agent_end ──► bridge.openReview()   (auto)
agent tool review_changes ──► bridge.openReview() (explicit)

ReviewChangesDialog
  baseline ─┬─ structuredPatch ─► hunks[]
  effective ┘          rejected set ─► applyPatch(baseline, reversed rejected hunks)
                                 │
                                 └─► bridge.setContent(effective) (review-guarded)
```

The baseline is captured lazily at the first mutation, so it represents the
state *entering* the agent edit (including any manual edits made before). After
Save (or "Keep all" + Save) the baseline is cleared.

---

## 5. Diff & undo model

Add the `diff` package as a **direct** dependency of `admin_ui` (already in the
lockfile, so no new transitive surface).

`admin_ui/src/lib/diff/hunks.ts`:

```ts
import { structuredPatch, applyPatch, reversePatch, type StructuredPatch, type Hunk } from 'diff';

export interface ReviewHunk extends Hunk {
  id: string;          // stable: `h${index}`
}

export function buildHunks(before: string, after: string): ReviewHunk[] {
  const patch = structuredPatch('before', 'after', before, after, '', '', { context: 3 });
  return patch.hunks.map((h, i) => ({ ...h, id: `h${i}` }));
}

/** Effective content = baseline with rejected hunks undone. */
export function applyRejected(
  before: string,
  after: string,
  rejected: ReadonlySet<string>,
): string {
  if (rejected.size === 0) return after;
  const patch = structuredPatch('before', 'after', before, after, '', '', { context: 3 });
  const kept: StructuredPatch = {
    ...patch,
    hunks: patch.hunks
      .map((h, i) => ({ hunk: h, id: `h${i}` }))
      .filter(({ id }) => rejected.has(id))
      .map(({ hunk }) => reversePatch({ ...patch, hunks: [hunk] }).hunks[0]),
  };
  return applyPatch(before, kept) ?? before;
}
```

Notes:
- `structuredPatch` context (3 lines) gives the familiar hunk grouping; hunk
  `id` is derived from the index of the *current* diff, so it is only stable
  while the diff inputs are unchanged. Recompute (and reset `rejected`) when
  the agent produces a new `after`.
- `reversePatch` + `applyPatch` keep the undo logic in one well-tested place
  instead of hand-rolled LCS merging.
- Detect "all changes rejected" (effective === before) to hide the dialog /
  offer to close.
- Normalize line endings (`\r\n` → `\n`) and remember whether the original had
  a trailing newline so recomposition doesn't add/remove one.

Frontmatter is a separate concern (§9).

---

## 6. Trigger design

Three ways to open review, all funneling through `bridge.openReview()`:

1. **Automatic after an agent turn (primary).** `AgentChat` already receives
   the `agent_end` event. Track whether any content-mutating tool
   (`update_content`, `update_frontmatter`) ran during the turn; if so, call
   `editor.openReview()` on `agent_end`. This is the "agent just edits, the
   rest is automatic" behavior.
2. **Explicit agent tool.** Add `review_changes` to `tools.ts` so the model can
   request review mid-turn (e.g. after a large rewrite, before continuing).
3. **Manual.** A toolbar button (re)opens the review for the pending diff.

### Bridge additions (`editor-mutations.ts`)

```ts
export interface EditorMutationBridge {
  // …existing…
  /** Open the review dialog for the current baseline→working-copy diff. */
  openReview: () => void;
}
```

`EditorPage` keeps `reviewBaselineRef`, `reviewDirtyRef` and `reviewOpen`
state, and implements `openReview` (no-op if there is no pending diff).

### Post-save alternative (decision)

Point 4 of the request mentioned the agent "just calling save". Because the
current architecture intentionally forbids agent writes and because per-hunk
undo is only clean *before* commit, the recommended design keeps Save
user-driven and reviews the working copy. If a post-save review is wanted
instead, it becomes: add a `save_page` tool → on success open the same dialog
diffing the previous revision (`pagesApi.revisionDiff`) → per-hunk undo is a
follow-up `restoreRevision`/partial re-save. That is strictly more complex and
creates extra revisions, so it is deferred to a later phase (see §11).

---

## 7. UI components & files

New:

| File | Purpose |
| --- | --- |
| `admin_ui/src/lib/diff/hunks.ts` | `buildHunks`, `applyRejected`, normalization helpers |
| `admin_ui/src/components/review-changes-dialog.tsx` | Modal shell, header stats, footer actions, keyboard/a11y |
| `admin_ui/src/components/diff/side-by-side.tsx` | Side-by-side (and unified) rendering of hunks with per-hunk controls |
| `admin_ui/src/components/ui/dialog.tsx` | Generic shadcn/Radix Dialog (none exists today) |

Changed:

| File | Change |
| --- | --- |
| `admin_ui/src/pages/editor.tsx` | Baseline ref, review state, `openReview` bridge method, render dialog, reset on Save |
| `admin_ui/src/lib/agent/editor-mutations.ts` | Add `openReview` to the bridge |
| `admin_ui/src/lib/agent/tools.ts` | Add `review_changes` tool |
| `admin_ui/src/components/agent/agent-chat.tsx` | Track content-tool usage; call `editor.openReview()` on `agent_end` |
| `admin_ui/src/lib/i18n.ts` | New `editor.review*` keys (en + zh) |
| `admin_ui/package.json` | Add `diff` (direct) and, if chosen, `react-diff-viewer-continued` |

Reuse: the same side-by-side renderer can replace the small `DiffLines` in the
revisions tab later, so the editor gets a consistent diff everywhere.

### Rendering library (decision to confirm)

- **Option A — `react-diff-viewer-continued` (suggested).** Split view,
  word-level diff and theming out of the box; `renderContent`/`renderGutter`
  can host per-hunk controls. Cost: a new dependency, plus verifying React 19
  compatibility (not currently in the tree) and mapping its internal hunks to
  our revert model.
- **Option B — custom renderer over `diff` (recommended).** We already need a
  structured hunk model for undo; rendering two synced line columns from that
  model is ~150 lines, matches the glass design system exactly, and adds no
  dependency. Word-level intra-line highlighting can be added with
  `diffWords` if desired.
- **Option C — reuse the server `line_diff`.** Rejected: it is keyed by
  revisions and returns flat lines, not hunks, and would require a new endpoint
  for pre-save content.

Recommendation: **B**, and keep A as a drop-in if split-view polish becomes a
priority. The hunk model in §5 is deliberately renderer-agnostic so either can
consume it.

---

## 8. i18n keys (en + zh)

```
editor.reviewTitle            "Review AI changes"
editor.reviewSubtitle         "{{count}} change(s)"
editor.reviewBefore           "Before (saved)"
editor.reviewAfter            "After (AI)"
editor.reviewUndoHunk         "Undo this change"
editor.reviewRedoHunk         "Restore this change"
editor.reviewUndoAll          "Undo all"
editor.reviewKeepAll          "Keep all"
editor.reviewPrev             "Previous change"
editor.reviewNext             "Next change"
editor.reviewSideBySide       "Side-by-side"
editor.reviewUnified          "Unified"
editor.reviewNoChanges        "No changes to review"
editor.reviewDiscardFrontmatter "Undo frontmatter change"
editor.reviewDirtyHint        "Changes are not saved until you Save."
```

---

## 9. Frontmatter (phase 2)

`update_frontmatter` can change `title`, `slug`, `date`, `tags`, `extra`, and
SEO fields. Options:

1. **Field-level diff** — a compact table (Before / After / Undo per field)
   rendered above the markdown diff when any field changed. This is clearer
   than a line diff for structured data.
2. Fold the assembled frontmatter YAML into the same text diff — simpler, but
   noisy and makes per-field undo awkward.

Recommendation: (1). Capture a frontmatter baseline alongside the body
baseline in the same lazy snapshot, and expose per-field revert via the
existing `bridge.setFrontMatter`.

---

## 10. Edge cases & risks

- **Large documents.** The existing revision diff caps at 200 lines. For
  review, compute hunks always but virtualize or collapse unchanged context
  (`showDiffOnly`) so a 10k-line page stays responsive.
- **Non-ASCII / CJK.** Line diffs are byte-safe; only intra-line word diff needs
  care (`diffWords` with `Intl.Segmenter` or disable word diff for CJK).
- **Line endings / trailing newline.** Normalize before diffing, restore after.
- **Agent edits while the dialog is open.** Freeze the baseline; if a new
  mutation arrives, either recompute and reset `rejected`, or queue a fresh
  review. Simplest: recompute on `after` change and drop now-invalid rejections.
- **Empty baseline (new page).** Everything is an "add"; the dialog still works
  (left column empty).
- **No-op edits.** Don't open when `before === after`.
- **Save races.** Reset baseline/rejected in the save `onSuccess` (and
  `onError` keeps it so the user can retry).
- **Accessibility.** Radix Dialog traps focus; ensure hunk revert buttons have
  `aria-label`s and the change summary is announced.
- **Reduced motion / transparency.** Follow the existing glass guards in
  `index.css`.

---

## 11. Phased implementation

**Phase 1 — model + basic dialog**
- [ ] Add `diff` as a direct `admin_ui` dependency.
- [ ] `lib/diff/hunks.ts` with unit-ish coverage via a scratch script.
- [ ] Generic `components/ui/dialog.tsx`.
- [ ] `ReviewChangesDialog` rendering hunks side-by-side, Keep all / Close.
- [ ] Baseline capture in EditorPage; `openReview` bridge method.
- [ ] Auto-open on `agent_end` when content tools ran; `review_changes` tool.
- [ ] i18n keys.

**Phase 2 — selective undo**
- [ ] Per-hunk revert, `rejected` set, `applyRejected` wiring to the bridge.
- [ ] Undo all / Keep all, live stats (+/− changes).
- [ ] Prev/next change navigation; unified/side-by-side toggle.

**Phase 3 — frontmatter + polish**
- [ ] Field-level frontmatter diff with per-field undo.
- [ ] Reuse the renderer in the revisions tab (`DiffLines` replacement).
- [ ] Toolbar "Review changes" button; optional auto-open setting.
- [ ] Large-doc collapse/virtualization.

**Phase 4 — optional post-save mode**
- [ ] `save_page` agent tool + revision-based review (only if wanted; see §6).

---

## 12. Open questions

1. **Renderer:** go with Option B (custom, no new dep) or Option A
   (`react-diff-viewer-continued`)? (Recommend B.)
2. **Auto-open policy:** always after an agent content edit, or only when the
   change exceeds a threshold (e.g. > 5 changed lines) / user-toggleable?
3. **Save from the dialog:** should the footer Save commit directly, or just
   close so the user uses the editor's Save (keeping one path)?
4. **Post-save review:** is the pre-save working-copy model sufficient, or is a
   revision-based post-save review also required (Phase 4)?
5. **Frontmatter scope:** include it in v1 or defer to Phase 3?

---

## 13. Decisions (locked) & status

Resolved in review:

1. **Renderer:** custom, no new diff dependency (the `diff` package was already
   transitive, now a direct `admin_ui` dep).
2. **Trigger:** always auto-open after an agent edit (at `agent_end` when a
   content tool ran), plus an explicit `save` agent tool.
3. **Close semantics:** closing the dialog applies the chosen result to the
   markdown editor; the real (server) Save remains the user's later action. No
   Save button inside the dialog.
4. **No post-save mode.** Model: agent edits content → agent calls `save` (the
   "save for review" API/tool) → review dialog opens → user decides what
   replaces the editor; the agent treats the task as done once `save` returns.
5. **Frontmatter:** out of scope for now; frontmatter-only edits do not open
   the dialog.

Implemented:

- `admin_ui/src/lib/diff/blocks.ts` — `buildDiff` / `recompose` / `changeStats`
  over `diffArrays` (lossless line handling; verified against replace / insert /
  delete / empty / multi-change / trailing-newline / no-op / partial-revert).
- `admin_ui/src/components/ui/dialog.tsx` — generic Radix Dialog.
- `admin_ui/src/components/review-changes-dialog.tsx` — modal, stats,
  Undo all / Keep all / Apply & close, per-change revert.
- `admin_ui/src/components/review-diff-view.tsx` — side-by-side rows, context
  collapsing, per-change action buttons.
- `EditorMutationBridge.openReview()`; baseline captured lazily on the first
  agent content mutation; result written back on close.
- `save` agent tool + auto-open at `agent_end`; system prompts updated.

Deferred (Phase 3/4): frontmatter field diff, reusing the renderer in the
revisions tab, a manual toolbar "Review changes" button, large-doc
virtualization, and the post-save mode.

### UI refinements (round 2)

- Dialog sized to the page header width (`max-w-[66rem]`, the `max-w-5xl`
  container plus the header's `-mx-4` overhang).
- Glass/Apple material: `glass-control-opaque` content, airy
  `bg-black/45 + backdrop-blur-md` scrim, `glass` buttons, uppercase panel
  labels, `tracking-tight` title; `glass-control-opaque` added to the
  reduced-transparency guard.
- Copy: title "Review Assistant Proposed Changes", columns "Current" /
  "Assistant Proposed", action "Done Review".

### Inline-editable "Assistant Proposed" rows (Option B)

Confirmed client-side (`diffArrays` in `lib/diff/blocks.ts`). Chosen design:
only the AI-changed lines are editable, so alignment and per-change undo stay
intact.

- `ChangeEdits` map in `lib/diff/blocks.ts`; `recompose(blocks, reverted,
  edits)` and `addedFor(block, edits)` honour overrides.
- `review-diff-view.tsx`: added lines render as auto-growing single-line
  `EditableLine` textareas (Enter suppressed, no newline insertion); context and
  removed rows stay read-only; reverted blocks are not editable.
- The dialog tracks `edits`, resets it with `reverted`, and `Done Review`
  writes the recomposed (possibly hand-edited) content back to the editor.

Limitation: new lines can't be added inside a change block (per-line editing
only); adding/removing lines stays with the main editor after Done Review.

### Round 3: staging, modal lock, width

- **Staged proposal.** `update_content` no longer writes to the editor. The
  bridge holds `pendingProposalRef` (and `reviewBaselineRef` captured on the
  first mutation); `openReview` diffs baseline → staged. The Milkdown content
  is only written by `handleReviewClose` after the user finishes review (Done
  Review → effective result; Reject all → baseline). `get_content` returns the
  staged proposal while one is pending.
- **No escape hatch.** The review dialog has no close button and suppresses Esc
  / outside-click (`showClose={false}`, `onEscapeKeyDown` /
  `onInteractOutside` prevented, `onOpenChange` a no-op). It can only be closed
  via **Reject all** or **Done Review**. "Undo all"/"Keep all" were replaced by
  the per-change toggles + Reject all.
- **Width.** Root cause of the narrow dialog: the shared `DialogContent` still
  carried `sm:max-w-lg`, whose media-query specificity beat the review dialog's
  unprefixed `max-w`. The base no longer pins a max-width; the review dialog
  uses `w-[calc(100vw-2rem)] max-w-5xl` so it matches the page container.
