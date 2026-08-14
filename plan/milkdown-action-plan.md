# Plan — Milkdown Editor + Rendering (Action Plan)

Based on `plan/markdown-editor-research.md`. Locked decisions:

- **Editor**: Milkdown via `@milkdown/crepe` v7.22.x (math ✅, v7 mature,
  ~0.89 MB gz). MDXEditor/Muya dropped.
- **Rendering**: **static HTML via `getHTML()`** (research §3d option B), not
  the read-only view — per review.
- **Mermaid**: our own plugin (research §3c).
- **Meta fields leave the markdown** (research Decision 1) → dedicated
  inputs + `buildFrontMatter()`.
- **Live preview pane removed**; WYSIWYG replaces it (research Decision 2).

Wrap library lives in **`frontend/src/lib/marked/`**.

---

## 1. Dependency + baseline

1. `cd frontend && pnpm add @milkdown/crepe` (pin `7.22.x`; pnpm, per
   AGENTS.md). `@milkdown/react` is **not** needed — Crepe is
   framework-agnostic; we write a small React wrapper ourselves.
2. Baseline gates before code changes: `pnpm run typecheck` and
   `php build.php` pass.
3. Bundle note (from research §4): +~2.6 MB raw / **~0.89 MB gz** incl. a
   Vue 3 runtime for Crepe's UI and its own KaTeX copy. Mermaid is **not**
   duplicated (we reuse the app's). Overlap with the app's KaTeX is possible
   if version ranges align.

## 2. Wrap lib `frontend/src/lib/marked/` (item 1)

Single source of truth for the **schema** so editor and renderer can never
drift. The renderer is just the same editor, read-only + headless.

```
frontend/src/lib/marked/
  index.ts             public API (MilkdownEditor, MarkdownView, markdownToHtml)
  shared.ts            createMarkdownEditor(root, { mode }) -> CrepeBuilder
  editor.tsx           MilkdownEditor React component (imperative handle)
  view.tsx             MarkdownView React component (article rendering)
  render.ts            markdownToHtml() + postProcessHtml() (async, queued)
  postprocess.ts       parity post-processors (mermaid/block-math/code/video/figure)
  plugins/mermaid.ts   our diagram node + NodeView + $remark + $inputRule
  plugins/image-directives.ts  port of remarkImageDirectives (attrs + toDOM)
  plugins/slug.ts      heading id attrs (TOC) via extended heading schema
  plugins/video.ts     (stretch) video node/placeholder for video-image links
  theme.css            crepe theme vars mapped to glass tokens (imported by index.css)
```

**`shared.ts` — the crux.**
- `createMarkdownEditor(root, { mode: 'edit' | 'render' })` returns a
  `CrepeBuilder` (already brings commonmark + gfm + history + indent +
  trailing + clipboard + upload).
- **Ordering matters**: register `codeMirror` before `latex` (the Latex
  feature throws if CodeMirror isn't flagged; features self-register into
  `FeaturesCtx` in add order — see crepe `core/slice.ts`).
- Edit mode adds: `codeMirror`, `latex`, `table`, `toolbar`, `blockEdit`,
  `imageBlock` (`onUpload` → existing assets API, `?module=asset&id=N`),
  `placeholder`, `listItem`, `linkTooltip`, `cursor`. No `topBar`, no `ai`.
- Render mode adds only: `codeMirror` + `latex` (latex requires it) + our
  plugins. `setReadonly(true)` on create. `getHTML()` ignores components, so
  code blocks still export as plain `<pre><code>` — good.
- **Both modes** register our plugins via `builder.editor.use([...])` before
  `create()`: mermaid, image-directives, slug. Same schema → same markdown
  semantics in edit and render.
- spellcheck off: `builder.editor.config(ctx => ctx.update(editorViewOptionsCtx,
  prev => ({ ...prev, attributes: { spellcheck: 'false' } })))`.
- Export `createSchema`/plugins list so the renderer reuses identical nodes.

**`render.ts`** — static HTML with parity:
- `markdownToHtml(md)`: lazily create a hidden renderer instance
  (`mode:'render'`, root = off-screen container), then
  `await editor.action(setMarkdown(body))` → `editor.action(getHTML())`.
  Serialize concurrent calls with a promise queue (React may call in
  parallel).
- `postProcessHtml(html, theme)` runs the parity steps (§5); shared
  `renderMermaid()` helper used by both the editor NodeView and here.

## 3. Mermaid plugin (item 2) — `plugins/mermaid.ts`

Follows research §3c; ~150–200 lines, zero new deps (uses app Mermaid 11).
- `$remark`: ```mermaid fenced blocks → `diagram` mdast node.
- `$nodeSchema('diagram')`: atomic block, `value` + `identity` attrs;
  `parseMarkdown`/`toMarkdown` round-trips to a plain ```mermaid fence
  (lossless, existing articles untouched); `toDOM` = raw-source div with
  `data-type="diagram"` (used by `getHTML`).
- `$view` **NodeView**: on mount call the app's async
  `mermaid.render(id, code)` (securityLevel strict, theme from `useTheme()`),
  inject SVG; error fallback shows the source (click to edit); re-render on
  value/theme change; dispose/destroy SVGs. NodeViews render in read-only
  too, but we use `getHTML` for the article page, so the render path uses
  `toDOM` + `postprocess`'s `renderMermaid()` instead — same helper, same
  SVG.
- `$inputRule` for ` ```mermaid ` + an insert command.

## 4. Editor page (item 3) — `frontend/src/pages/editor.tsx`

- Replace the two-pane grid (`textarea` + `Markdown` preview) with:
  - Header fields: Title, Slug, Date (`YYYY-MM-DD`), **Tags**, status switch,
    grants panel (unchanged), delete/save buttons.
  - `MilkdownEditor` in a `glass-control` panel, full-height.
- Load: `parseFrontMatter(page.content_md)` → populate fields, pass
  `.content` as the editor's initial markdown.
- Save: validate (existing `SLUG_RE`/`DATE_RE`) → `content_md =
  buildFrontMatter({title, slug, date, tags}) + ref.getMarkdown()` → existing
  mutation/navigation flow unchanged.
- `frontend/src/lib/front-matter.ts`: add `buildFrontMatter(...)` (quoted
  title/slug, `tags: [..]` or omitted); `parseFrontMatter` unchanged (still
  used by article pages).
- i18n: add `editor.*` keys (title/slug/date/tags field labels, save
  errors), drop preview keys; mirror in `zh`. Crepe's internal toolbar
  labels stay English (per-string overrides optional, see §7).

## 5. Article rendering (item 4) — `frontend/src/pages/article-detail.tsx`

- Replace `<Markdown content={...}/>` with `<MarkdownView content={...}/>`
  inside the existing `.prose max-w-none` container. `MarkdownView` keeps
  the `contentRef` so `useArticleHeadings`/`useScrollSpy`/TOC keep working
  (slug plugin emits `h2[id]/h3[id]`).
- Home reuses `ArticleDetailPage` → covered automatically.
- Parity checklist delivered by `postProcessHtml` (from §3d):
  - inline math: already KaTeX inside `toDOM` — no step.
  - block math: `language-latex` `<pre>` → `katex.renderToString({displayMode:true})`.
  - code blocks: syntax-highlight pass (reuse the app's highlighter).
  - mermaid: `div[data-type="diagram"]` → `renderMermaid()` SVG.
  - image directives: emitted as `width`/`height`/class attrs by the image
    node `toDOM`; lone-image paragraphs → `<figure>`+`<figcaption>`.
  - video embeds: images whose src matches `resolveVideo()` → `<video>` /
    YouTube/Bilibili `<iframe>` (stretch, §6).
- After both the editor and article page are off react-markdown, remove
  `react-markdown`, `rehype-*`, `remark-gfm`, `remark-math` deps (net bundle
  win).

## 6. Own-syntax coverage (item 5)

| Feature (today) | Milkdown mechanism | Effort |
|---|---|---|
| GFM tables / task lists / strikethrough | `preset-gfm` (built-in) | none |
| KaTeX `$..$` / `$$..$$` | Latex feature (inline toDOM; block via post-process) | small |
| Mermaid ```mermaid | `plugins/mermaid.ts` | this plan §3 |
| Image directives `![Alt\|640]`, floats, center | `plugins/image-directives.ts`: $remark port + image node `width/height/className` attrs + toDOM; figure post-process | medium |
| Video embeds (file/Youtube/Bilibili, `filetype=mp4`) | `plugins/video.ts`: $remark marks video-src images → custom `video` node; editor shows placeholder chip; render emits player HTML | medium (stretch) |
| Heading ids + TOC | `plugins/slug.ts` (extend heading schema with `id` attr; toMarkdown drops it) | small |
| Pipes-in-code-in-tables workaround | port `escapeTableCodePipes` as a pre-parse step (verify milkdown's table parser first) | small |
| Front matter | `parseFrontMatter` / `buildFrontMatter` outside the editor | small |
| External-link `target=_blank` | post-process `<a>` tags (or accept current behavior) | trivial |

After porting, diff real articles (`content_md` before/after an edit cycle)
and eyeball the rendered DOM against today's `.prose` output for the same
document (no browser per AGENTS.md — use a dev build + curl/static dump and
code inspection).

## 7. Theming & i18n

- `index.css`: `@import '@milkdown/crepe/theme/classic.css'` (+
  `classic-dark.css`), then override `--crepe-color-*` with the app's glass
  tokens; scope the `.milkdown` surface to the editor/render containers; dark
  driven by `useTheme()` (toggle a data-attribute). `.prose` typography
  inside the article view; unlayered overrides per AGENTS.md where crepe
  content rules fight `.prose`. `prefers-reduced-motion` /
  `prefers-reduced-transparency` guards.
- i18n: Crepe UI has no locale system — English toolbar labels are
  acceptable for v1; later fill the `*Label` per-string config overrides with
  `zh`. Only our own field labels need new keys.

## 8. Rollout order & verification

Order: (1) deps + baseline → (2) `marked/` skeleton + `shared.ts` →
(3) mermaid plugin → (4) editor page swap → (5) `MarkdownView` on article
detail → (6) syntax ports + `escapeTableCodePipes` → (7) drop react-markdown
deps + AGENTS.md notes.

Verification (no browser, per AGENTS.md):
- `pnpm run typecheck`, `php build.php`, `./rel.sh`, `php -l dist/sifpress.php`.
- curl smoke: create → get → update a page whose body has a table, task
  list, `![Alt|640]` directive, ```mermaid block, `$math$`; assert
  `content_md` round-trips and `tags` parse from assembled front-matter.
- Code inspection: editor mounts once; save reads `ref.getMarkdown()`;
  `MarkdownView` uses `getHTML()`; plugin registration identical in both
  modes.
- Optional: add Vitest (none configured today) for the pure plugin logic —
  remark transform + markdown→node→markdown round-trip runs in Node without
  a DOM.

## 9. Risks

- **R1 — Bundle**: ~0.89 MB gz added (+ Vue runtime). Accepted per §4.
- **R2 — Round-trip normalization**: Milkdown re-serializes (bullet markers,
  fences). Align options; diff before/after on real articles.
- **R3 — Image directives**: port and verify round-trip + rendered attrs;
  pre/post transform if the lexer mangles `|` in alt.
- **R7 — Mermaid async lifecycle**: race/dispose/error-fallback in the
  NodeView; the additive node serializes to a plain fence, so worst case is
  a non-rendering but round-tripping block.
- **R8 — Render parity**: block-math/code/video/figure post-processors must
  match the editor; directive/video syntax must be ported or it regresses in
  *both*. Keep react-markdown until both pages are verified.
- **R9 — Shared-schema discipline**: any new node/attr must be registered in
  `shared.ts` (both modes), or editor and renderer diverge.
- **R10 — Crepe feature coupling**: Latex requires CodeMirror; keep
  `addFeature` ordering (`codeMirror` → `latex`) and note it in AGENTS.md.
- **R11 — Hidden-renderer concurrency**: queue `markdownToHtml` calls;
  destroy the instance on app unmount if the singleton is module-scoped.
