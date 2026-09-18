# agent-composer-redesign.md — single-card agent composer

> Status: **implemented**. Companion to
> `plan/pi-web-agent-plan.md`, `plan/selection-revision-plan.md`,
> `plan/mcp-support-plan.md`.

Reference: `~/.suwu/dropbox/image_3.png`. Goal: collapse the agent composer into
one rounded card with a borderless textarea on top and a single control row at
the bottom — `+` (upload) on the left, and status + thinking + model pill +
round send/stop on the right. Turn the selection chip into a collapsible
"clamped selection" button.

```
┌───────────────────────────────────────────────────────────┐
│ Type a message…                                           │
│                                                           │
│ (+)                          (◐) [💡] [ model ▾ ]    ( ↑ ) │
└───────────────────────────────────────────────────────────┘
```

Locked decisions:

1. Images are **attached to the outgoing message as `ImageContent`** so the
   model sees them, when the active model supports image input
   (`model.input` includes `'image'`). Otherwise fall back to the asset-upload
   path below.
2. Thinking level is a **separate control** next to the model pill (lightbulb
   icon), not folded into the model popover.
3. "First few words" preview ≈ 42 chars at a word boundary; expanded view caps
   at 400 chars.
4. Send is a **round button with an up arrow** (`ArrowUp`).

---

## 1. Current state

All in `admin_ui/src/components/agent/agent-chat.tsx` unless noted:

- **Footer/composer** (lines ~824–925):
  - Row 1 **above** the form: model `Select` (`min-w-0 flex-1`) + thinking
    `Select` (`w-20`) from `@/components/ui/select` (lines ~826–866).
  - `<form>` with an optional selection chip, then `textarea` + `Send`/`Square`
    icon button side by side (lines ~867–923).
- **Selection chip** (lines ~873–889): `Sparkles` + truncated
  `t('agent.selectionChip', { count })` + `X` clear.
- **User message rendering** (lines ~573–579): renders only `messageText()` as
  a paragraph — image blocks are not rendered.
- **Model data**: `listAvailableModels()` → `{ provider, providerName, model }`;
  `model.name`, `model.input` (`('text'|'image')[]`), `model.reasoning`.
  `latestModelValue = "<provider>::<modelId>"`; `changeModel`, `changeThinking`.
- **`handleSend`** (lines ~455–492): builds a `string` prompt (with the
  selection-revision wrapper when a selection exists) and calls
  `instance.prompt(prompt)`.
- **Selection source**: `admin_ui/src/pages/editor.tsx` holds `agentSelection`
  and passes `selection` + `onClearSelection`; the panel is
  `width: min(80vw, 51.2rem)` (≈819px).
- **No attachment pipeline exists** anywhere in the agent.
- **Reusable upload path**: `assetsApi.create(formData)` (`ui_sdk/src/pages.ts`),
  `assetMarkdownLink(name, id, kind)` / `assetSourceUrl(...)`
  (`ui_sdk/src/api.ts`), and canvas downscaling in `ui_sdk/src/assets.ts`
  (`makeImageThumb`, 400px max edge WebP). Used by the editor's `handleUpload`
  (`admin_ui/src/pages/editor.tsx:450`).
- UI primitives available: `button`, `popover`, `dropdown-menu`, `input`,
  `badge`, `select`.

---

## 2. Target behavior

1. **One card.** Borderless auto-growing textarea on top; footer row inside the
   same rounded/bordered container.
2. **Thinking control + model pill, bottom-right**, left of the send button:
   - compact lightbulb `Select` (icon-only) for `THINKING_LEVELS`;
   - model pill: glyph + model short name + capability badges (`vision` when
     `model.input` includes `image`, `reasoning` when `model.reasoning`);
     clicking opens a popover listing providers/models.
3. **Upload button, bottom-left.** `+` round icon button → file picker for an
   image or a document.
4. **Image attachments (vision).** If the active model supports image input,
   the picked image is downscaled, shown as a removable thumbnail chip above
   the textarea, and attached as an `ImageContent` block on the outgoing user
   message. If the model does **not** support image input, the image falls back
   to the asset-upload path (with a hint).
5. **Files.** Non-image files upload via `assetsApi.create` and insert a
   markdown reference at the composer caret (`assetMarkdownLink` for
   image/video assets, `[name](url)` otherwise).
6. **Clamped selection button.** When a selection exists, a button reads
   `Clamped selection: “<first few words>…” (N chars)`. Clicking expands it to
   show the selection text capped at **400 chars** (with an "…N more" hint).
   `X` clears the selection.
7. **Status.** A small spinner shows while streaming/thinking; the send button
   becomes a stop button (`Square`) during streaming.
8. **Unchanged semantics.** The selection-revision wrapper is preserved. When
   attachments exist the prompt becomes a content-block array; otherwise it
   stays a plain string.

---

## 3. Phased implementation

### Phase 1 — Composer shell

`agent-chat.tsx` footer:

- Replace the `border-t … p-2` footer with a single card: outer
  `rounded-2xl border border-input/60 bg-background/60 p-2`.
  - textarea first, **borderless** (`border-0 bg-transparent focus:ring-0`),
    `rows={1}` with auto-grow (recompute `style.height` on change, cap ~160px).
  - control row: `flex items-center justify-between gap-2 pt-1`.
- Keep the `<form onSubmit>` wrapper and the `Enter`/`Shift+Enter` handling.
- Keep `handleStop` and the disable logic (extended in Phase 3 to allow
  attachment-only sends).

### Phase 2 — Thinking select + model pill (bottom-right)

- Render, in order: streaming spinner, compact thinking control, model pill,
  send/stop.
- **Thinking**: keep `@/components/ui/select` but render the trigger as an
  icon-only round button (`Button asChild` or a styled `SelectTrigger` with
  `size="icon-sm"`), showing `Lightbulb` dimmed when `off`. `SelectContent`
  lists `THINKING_LEVELS` with `t('agent.level.*')`.
- **Model picker** subcomponent in the same file:
  - `Popover` + `PopoverTrigger asChild` → round pill
    (`h-7 rounded-full px-2 gap-1.5 max-w-[60%]`).
  - Trigger: `Bot` glyph (size-3.5), truncated `model.name`, then small
    `Badge`s: `vision` / `reasoning` (`t('agent.tagVision')`,
    `t('agent.tagReasoning')`).
  - `PopoverContent align="end" side="top"`, scrollable model list
    (`max-h-56 overflow-y-auto`), one row per `allModels` entry with
    `model.name` + muted `providerName`, check on the active one; click →
    `changeModel(provider, id)`.
  - Empty `allModels`: pill disabled; keep the `agent.noModelsHint` line
    (line ~697).
- Remove the old top-row model/thinking `Select`s and the unused `select`
  import if nothing else uses it.

### Phase 3 — Attachments (upload button + vision)

State (in `AgentChat`):

```ts
interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  data: string;      // base64 (no data: prefix)
  previewUrl: string; // object URL or data URL for the chip
}
const [attachments, setAttachments] = useState<Attachment[]>([]);
const [uploading, setUploading] = useState(false);
const fileInputRef = useRef<HTMLInputElement>(null);
```

- Hidden `<input type="file" hidden ref={fileInputRef} multiple
  accept="image/*,application/pdf,.md,.txt">`; `+` button
  (`Button variant="outline" size="icon-sm"`, round, `Plus` glyph) calls
  `fileInputRef.current?.click()`.
- `handleFiles(files: FileList)`:
  1. `setUploading(true)`.
  2. For each image file when `modelSupportsImages(model)`:
     - downscale to ≤ ~1024px via a new `makeVisionImage(file)` helper in
       `ui_sdk/src/assets.ts` (mirrors `drawToThumb`, `VISION_MAX_EDGE = 1024`,
       WebP 0.85);
     - read the blob as base64; push an `Attachment` with an object-URL
       preview.
     - Guard total size (e.g. reject > ~2MB base64 each / ~8MB total) and
       revoke object URLs on removal/unmount.
  3. For images on **non-vision** models, and for all non-image files:
     - upload via `assetsApi.create(formData)` and insert the reference at the
       textarea caret:
       - image/video asset → `assetMarkdownLink(name, id, kind)`;
       - otherwise → `[name](${assetSourceUrl(id, name, kind)})`;
       - wrap as its own line when `input` is non-empty; restore the caret
         after the insertion.
     - Show `agent.uploadImageUnsupported` hint for the non-vision image case.
  4. On error, surface via `setRunError` / toast (`sonner` is present).
  5. `input.value = ''` so the same file can be re-picked.
- Render attachment chips between the textarea and the control row: small
  rounded thumbnails with a hover `X` to remove (`aria-label` + `t('agent.removeAttachment')`).
- `handleSend`: build the user message:
  ```ts
  const content = attachments.length > 0
    ? [{ type: 'text' as const, text: prompt },
       ...attachments.map(a => ({ type: 'image' as const, data: a.data, mimeType: a.mimeType }))]
    : prompt;
  await instance.prompt({ role: 'user', content, timestamp: Date.now() });
  ```
  Clear `attachments` after a successful send; keep them on error.
  Allow send when `input.trim() === ''` but `attachments.length > 0`.
- `renderMessage` user branch (lines ~573–579): render `ImageContent` blocks as
  `<img src={`data:${mimeType};base64,${data}`} className="max-h-48 rounded-lg" />`
  above the text.
- Persistence caveat: `saveSession` stores `agent.state.messages` in
  localStorage, so base64 images count against quota. Mitigation: commit to
  WebP ≤1024px + size caps; document the trade-off. (Optional follow-up: strip
  image data when persisting and keep only a preview.)

### Phase 4 — Clamped-selection button

- Helpers near the top of the file:

  ```ts
  const SELECTION_PREVIEW_MAX = 400;

  function selectionPreview(selection: string): string {
    const flat = selection.replace(/\s+/g, ' ').trim();
    if (flat.length <= 42) return flat;
    const cut = flat.slice(0, 42);
    const word = cut.slice(0, cut.lastIndexOf(' '));
    return `${word.length > 16 ? word : cut}…`;
  }
  ```

- Replace the chip block with a collapsible button:
  - collapsed: `t('agent.selectionClamped', { preview, count })` →
    `Clamped selection: “Intro paragraph…” (1 284 chars)`.
  - `useState` `selectionExpanded`; toggling sets `aria-expanded`; reset to
    `false` when `selection` becomes empty.
  - expanded panel: `whitespace-pre-wrap break-words text-xs text-muted-foreground`
    showing `selection.slice(0, SELECTION_PREVIEW_MAX)`; when longer, append
    `t('agent.selectionMore', { count: selection.length - SELECTION_PREVIEW_MAX })`.
  - keep the `X` clear button (`onClearSelection`, `stopPropagation`).
- The full `selection` string is still what `handleSend` embeds — the 400-char
  cap is **display-only**.

### Phase 5 — i18n, formatting, verification

`admin_ui/src/lib/i18n.ts` (`en` ~line 552, `zh` ~line 1158):

- Replace `agent.selectionChip` with `selectionClamped`, `selectionMore`,
  `selectionExpand`, `selectionCollapse`.
- Add `upload` / `uploadImage` / `uploadFile` / `uploading` / `uploadFailed` /
  `uploadImageUnsupported` / `removeAttachment`.
- Add `tagVision` / `tagReasoning`.

Cleanup: drop `Sparkles`; add `ArrowUp`, `Lightbulb`, `Paperclip`/`Plus`;
`Loader2` is already imported.

---

## 4. Verification

- `cd admin_ui && pnpm run format`; `cd ui_sdk && pnpm run format` (assets
  helper change).
- `cd admin_ui && pnpm run typecheck`.
- `php build.php` (dev artifact builds the admin bundle).
- Manual (curl/code inspection only — **no browser**):
  - composer is one card; `+` bottom-left; spinner + lightbulb + model pill +
    round arrow-up bottom-right;
  - selecting editor text and clicking "Revise with AI" shows the
    clamped-selection button; expanding shows ≤400 chars;
  - with a vision model, picking an image adds a removable chip and the
    outgoing message carries an `image` content block;
  - with a non-vision model, picking an image uploads it and inserts a
    markdown reference.
