# Plan — Replace Side-by-Side Markdown Editor (MDXEditor vs Muya vs Milkdown)

Scope: swap the current two-pane **textarea + live preview** editor
(`frontend/src/pages/editor.tsx`) for a WYSIWYG Markdown editor. Three
candidates were researched in depth — **MDXEditor** (`@mdxeditor/editor`),
**Muya** (`@muyajs/core`, the Mark Text editor core), and **Milkdown**
(`@milkdown/crepe`, added to this doc Aug 2026). Article *rendering* (the
`Markdown` component on `/article` pages and home) is **not** touched; only
the editing surface changes. Storage format (`content_md` = full markdown
with YAML front-matter) is preserved either way.

---

## 1. Candidates at a glance

| | MDXEditor | Muya (`@muyajs/core`) | Milkdown (`@milkdown/crepe`) |
|---|---|---|---|
| Version | 4.2.0 (Jul 2026) | 0.2.0 (Jun 2026) | 7.22.1 (Aug 2026) |
| License | MIT | MIT | MIT |
| Adoption | ~1.2M weekly npm downloads | extracted from Mark Text (60k★) | ~287k weekly core dl; 11.8k★ repo |
| React 19 | ✅ (`>=18 \|\| >=19` peer) | ✅ (framework-agnostic, plain DOM class) | ✅ official `@milkdown/react` (peer `react: *`) |
| Architecture | Lexical + micromark/mdast | custom block tree + OT JSON state (`ot-json1`) | ProseMirror + remark/unified; plugin-driven; headless core |
| **Math (KaTeX) editing** | ❌ none | ✅ WYSIWYG, round-trips `$..$`/`$$..$$` | ✅ WYSIWYG (Crepe `Latex` feature), round-trips `$..$`/`$$..$$` |
| **Mermaid editing** | ❌ (code block only) | ✅ rendered in-editor + round-trips ` ```mermaid ` | ❌ built-in; feasible as a small custom node plugin (§3c) |
| Diagrams (Vega/PlantUML/flowchart) | ❌ | ✅ | ❌ |
| Source-mode toggle | ✅ built-in (`diffSourcePlugin`) | ❌ — we build a simple one | ❌ — we build a simple one (`plugin-diff` is diff-review, not source) |
| Front matter | free-form plugin | ✅ native (`frontMatter: true`, yaml/toml) | ❌ no plugin — dedicated fields (Decision 1) |
| GFM tables / task lists | ✅ | ✅ | ✅ (`preset-gfm` / `commonmark`) |
| Code blocks | CodeMirror 6 | Prism highlight + language selector | CodeMirror 6 (Crepe feature) or `plugin-prism` |
| i18n | translation prop (bring your own) | ✅ 9 bundled locales incl. `zhCN` | ⚠️ hardcoded EN UI; per-string label overrides only (see §3b) |
| Dark theme | Radix CSS vars (`dark-theme` class) | none in core.css — custom CSS overrides | ✅ headless + 6 CSS themes, `--crepe-color-*` vars |
| Production readiness | mature, v4 | **README: "not yet recommended for production use; APIs may change between minor versions"** | mature, v7, very active (published 2 days ago) |
| Bundle (full graph, min+gz) | ~1.7 MB / **~560 KB gz** | ~12.5 MB / **~3.7 MB gz** (see §4) | ~2.6 MB / **~0.89 MB gz** (see §4) |

---

## 2. MDXEditor — findings

- Actively maintained (v4.2.0, MIT). "Just works in Vite"; ships `style.css`.
- WYSIWYG + a **source/diff toggle built in** (`diffSourcePlugin`), which
  directly replaces today's side-by-side preview for markdown power users.
- Plugin set covers headings, lists, quotes, thematic breaks, links +
  dialog, images (insert-by-URL), GFM tables, task lists, markdown
  shortcuts, and CodeMirror-6 fenced-code editing.
- **Controlled-component caveat**: `markdown` prop is `defaultValue`-like.
  Read the body via `ref.getMarkdown()`, push via `ref.setMarkdown()`.
  Feeding `onChange` output back into `markdown` causes lag.
- **Gaps (why the user prefers Muya)**: no math plugin — `$..$`/`$$..$$`
  round-trip as literal text and are not WYSIWYG-edited; mermaid blocks
  stay inert code blocks inside the editor. Custom render-time image
  directives (`![Alt|640](url)`) are not interpreted but alt text should
  round-trip (spike to confirm, §6 R3).
- Theming: Radix color CSS variables; add `dark-theme` class for dark.
  Mappable to the app's tokens.

## 3. Muya — findings

- The Mark Text editor core, now extracted and published as `@muyajs/core`.
  The repo is **actively maintained** (commits as recent as Jul 2026), MIT,
  TypeScript-first, ships ESM/CJS/UMD + types. Bundle target chrome70.
- **Framework-agnostic**: `new Muya(container, { markdown, ... })` →
  `init()`, `getMarkdown()`, `setContent()`, `on/off` events, `destroy()`.
  A thin React wrapper (mount on ref, destroy on unmount) is ~40 lines.
- **Exactly the math/mermaid story**: KaTeX math, Mermaid 11, Vega/Vega-Lite,
  PlantUML, flowchart.js, Prism highlighting all render in-editor with
  floating toolbars (`Muya.use(...)` plugin registry).
- **State-based round-trip** (source of truth is an OT JSON document, not
  rendered HTML): `stateToMarkdown.ts` explicitly serializes math blocks
  back to `$$…$$` / ` ```math ` and diagrams back to fenced code, so
  existing content survives edits faithfully.
- Native front-matter (`frontMatter: true`, `frontmatterType: '-'`) — the
  block round-trips in-document; supports required-field validation via
  dedicated fields instead (see §5 decision 1).
- i18n built in, including `zhCN` — matches the app's en/zh pair out of
  the box.
- **Cons / risks**:
  - **v0.2.0, pre-1.0**: README explicitly warns APIs may change between
    minor versions and the project is "not yet recommended for production
    use". A pin + upgrade watch is required.
  - **Bundle size**: see §4 — this is the decisive trade-off.
  - **No built-in source-mode toggle** — the desktop app's Source Code Mode
    is not in the core. We add a small raw-markdown mode ourselves
    (swap to a `<textarea>`, round-trip via `getMarkdown()`/`setContent()`,
    or embed the source editor we already have).
  - No official React wrapper (we write one) and no dark-theme CSS vars
    (core.css is light; we theme via our own overrides on the glass tokens).
   - Image insert/paste expects an embedder hook (`imageAction`) — wire it
     to the existing assets API (`?module=asset&id=N`).

## 3b. Milkdown — findings

Researched Aug 2026 against the Milkdown v7 monorepo
(`github.com/Milkdown/milkdown`) and npm. Milkdown is a **plugin-driven
WYSIWYG framework** built on **ProseMirror + remark/unified**. The core /
`@milkdown/kit` layer is **headless (no CSS)**; **Crepe** (`@milkdown/crepe`)
is the recommended batteries-included editor class built on it.

- **Health**: MIT, 11.8k★, 3.4k commits, very active (v7.22.1 published 2
  days ago). `@milkdown/core` ~287k weekly downloads, `@milkdown/react`
  ~141k, `@milkdown/crepe` ~176k. **Production-grade and stable** — a clear
  upgrade over Muya's v0.2.0 pre-1.0 status.
- **React integration**: official `@milkdown/react` (`<MilkdownProvider />`
  + `<Milkdown />` + `useEditor`/`useInstance`), peer `react: *` ✅ React 19.
  No controlled-prop gotchas: read via `crepe.getMarkdown()`, write via
  `crepe.editor.action(setMarkdown(...))`, subscribe via
  `crepe.on(api => api.markdownUpdated(...))`.
- **Math (KaTeX): ✅.** Crepe's `Latex` feature (on by default) is real
  WYSIWYG math via KaTeX: inline `$..$` (input rule on `$`) and block
  `$$..$$` (a `$$` code fence with language `latex`), both serialized back
  to `$..$`/`$$..$$` on export. Note the old standalone
  `@milkdown/plugin-math` is **deprecated** — math now lives only in Crepe.
- **Mermaid/diagrams: ❌ built-in, but a custom plugin is feasible (§3c).**
  v7 ships no diagram/mermaid plugin and the old `@milkdown/plugin-diagram`
  is deprecated. Out of the box, Mermaid blocks are CodeMirror-editable
  code fences that round-trip fine but don't render in-editor. However the
  old plugin is a ready-made template, and Mermaid is already in the app's
  bundle — a ~150-line custom node plugin (kit `$remark` + `$nodeSchema` +
  a NodeView) adds in-editor render at **zero extra bundle cost**. See §3c.
- **Crepe feature set** (per-feature toggles; TopBar and AI are opt-in):
  CodeMirror 6 code blocks, ListItem, LinkTooltip, Cursor, ImageBlock
  (upload hook), BlockEdit (drag handles + slash menu), Toolbar, Placeholder,
  Table, Latex, TopBar, AI. GFM tables/task lists/strikethrough via
  `preset-gfm`. Features are wired with **static imports** (no dynamic
  `import()` in the loader), so `inlineDynamicImports: true` inlines
  cleanly.
- **Source mode**: no built-in toggle. `@milkdown/plugin-diff` is a
  *diff-review* tool (compare/accept two docs), not a source mode — we build
  the textarea swap as in the Muya plan.
- **Front matter**: no plugin — covered by dedicated fields (Decision 1).
- **i18n: partial — the main UX gap.** Crepe's UI (toolbar, slash menu,
  table menu, image-upload buttons, code-language search, placeholder,
  top-bar) is **hardcoded English**; there is no locale system. Feature
  configs expose *per-string* label overrides (`boldLabel`, `Upload file`,
  `Search language`, …) we could fill from the app's en/zh i18n, but the
  strings are scattered and coverage needs an audit. Weaker than Muya
  (bundled `zhCN`) and MDXEditor (`translation` prop).
- **Theming: strong fit.** Headless core + Crepe ships 6 CSS themes
  (`theme/classic.css`, `classic-dark`, `nord`, `nord-dark`, `frame`,
  `frame-dark`) all driven by `--crepe-color-*` custom properties on the
  `.milkdown` class. Override with the app's glass tokens + `useTheme()`
  dark toggle; `.prose` typography applies inside the contenteditable.
- **⚠️ Vue caveat — why it exists**: Milkdown is *not* a Vue project — the
  core is TypeScript on ProseMirror + remark and is headless /
  framework-agnostic. Only **Crepe's interactive chrome** is written in
  **Vue 3**: the floating toolbar, slash/block-edit menu, table controls,
  top-bar, link tooltips, and the `@milkdown/kit/component/*` widgets
  (code-block, image-block, list-item-block, table-block). The author chose
  Vue 3 for these widget components; `vue` is a hard dependency of
  `@milkdown/crepe`, and the feature loader imports them statically, so the
  runtime ships in the bundle even in a React app and even when those
  features aren't mounted. ~35–45 KB gz of the ~0.89 MB gz, inert (separate
  component tree) but pure overhead. Dropping it would mean skipping the
  Vue-based features (no toolbar/slash/table chrome).
- **Image handling**: the ImageBlock feature's `onUpload: (file) =>
  Promise<string>` wires pasted/dropped images to the assets API
  (`?module=asset&id=N`), same role as Muya's `imageAction`.
- **Bundle**: full Crepe ≈ **2.6 MB raw / ~0.89 MB gz** (main ~448 KB gz +
  KaTeX + CodeMirror languages + ProseMirror + remark + Vue). ~1.6×
  MDXEditor, under ¼ of Muya. KaTeX overlaps the app's existing rendering
  bundle; the Vue runtime is the only purely-new weight.
- **Extras (unneeded, but show maturity)**: Y.js collaboration
  (`@milkdown/plugin-collab`), opt-in AI assistant (streaming + diff
  review), `plugin-emoji`, `plugin-clipboard`, `plugin-upload`.

## 3c. Custom Mermaid plugin — feasible (with a working template)

Yes. Milkdown v7's kit exposes everything needed, and the project's own
(now deprecated) `@milkdown/plugin-diagram` is a ready-made template for
exactly this feature. How it worked:

- **Parse**: a remark transform (`$remark`) rewrites ```mermaid fenced
  blocks into a custom `diagram` mdast node; `toMarkdown` serializes it
  back to a plain ```mermaid fence — lossless round-trip, existing
  articles untouched.
- **Node**: a ProseMirror block node (`$nodeSchema`, atomic, `value` attr
  holding the source) + an `$inputRule` for ```mermaid and an insert
  command.
- **Render**: pre-"Headless" the plugin's `toDOM` called the then-sync
  `mermaid.render()` and injected the SVG. The Headless refactor dropped
  that, and Mermaid v10+/v11 is async — so the modern form is a **NodeView**
  (via `$view`): on mount call the app's existing async
  `mermaid.render(id, code)`, inject the SVG, fall back to the raw source
  on parse error (still editable), re-render on attr/theme change, dispose
  on destroy.

Effort: a single `mermaid-diagram.ts` (~120–200 lines + theme CSS). The app
already bundles Mermaid 11 for article rendering, so **zero new
dependencies and no extra bundle weight**. Because the node serializes to a
plain fenced block, the plugin is purely additive (no migration risk).

Caveats:
- Async render needs lifecycle care (races on rapid edits, SVG cleanup,
  error state); the old sync approach does not work with Mermaid v11.
- A NodeView renders in **both editable and read-only** views (NodeViews
  are not editable-gated), so the same widget serves the editor *and* any
  Milkdown-based rendering (§3d).
- Optional polish: click-to-edit (swap back to a code block), light/dark
  `mermaidTheme` from `useTheme()`.

## 3d. Using Milkdown for rendering — yes, two ways

Rendering today is react-markdown + remark-gfm/remark-math + rehype-katex
+ custom Mermaid/KaTeX components under `.prose`. Milkdown can replace
that, and because both paths share the same parser/schema, **what you edit
is exactly what you render** (no math/GFM/mermaid drift). Two approaches:

**(A) Read-only view (best parity).** Mount a minimal Milkdown editor
(commonmark + gfm presets + Latex + our Mermaid node; no toolbar/block-edit
chrome) and call `setReadonly(true)`. ProseMirror renders the doc WYSIWYG;
KaTeX and the Mermaid NodeView render natively. Since the editor code is
already in the artifact, this adds ~no new JS. Cost: one ProseMirror
instance per rendered document — fits single-article pages, not
excerpt-heavy listing cards (keep those as plain-text previews). The
`.milkdown` theme CSS needs a pass to map onto the app's `.prose` glass
typography.

**Perf: not a slowdown for this app.** Full markdown is currently rendered
in exactly one place (`article-detail.tsx`; listing cards already use text
excerpts), so a read-only view means one ProseMirror instance per page.
Parse (remark/micromark) and KaTeX/Mermaid work are the *same libraries and
same work* as today's react-markdown; only react-markdown's React
reconciliation is swapped for ProseMirror's direct DOM build (comparable or
cheaper, both synchronous, single-digit ms for typical articles). The
avoidable costs are: don't enable CodeMirror on the render instance (plain
`<pre><code>` is lighter than today's `rehypeHighlight`) and don't mount
Crepe's Vue-based UI features (dead weight, not runtime). Both approaches
scale linearly with article size.

**(B) Static HTML (lighter, keeps `.prose`).** Milkdown's transformer
(`createRemarkParser`) parses markdown → a ProseMirror doc with the same
schema, and `getHTML()` (`DOMSerializer.fromSchema(...).serializeFragment`)
emits an HTML string for injection under the existing `.prose` styling.
Async nodes (Mermaid) need a small post-render step — scan
`div[data-type="diagram"]`, call `mermaid.render()`, swap in the SVG
(mirrors what the old plugin did synchronously). You keep
`dangerouslySetInnerHTML` + component mapping, but every node type must be
serialized to HTML yourself (links, tables, code, KaTeX via data-attr
spans).

**Can (B) match the editor pixel-for-pixel? Mostly yes, not automatically.**
The serializer walks the *same schema's* `toDOM`, so any node the editor
renders through `toDOM` produces identical DOM in the export. Concretely:

- **Inline math — identical for free.** Crepe's inline-math `toDOM` calls
  `katex.render()` directly, so the editor view and `DOMSerializer` emit the
  same KaTeX DOM (same lib + options).
- **Block math `$$..$$` — needs one post step.** In Crepe it is a
  `codeBlock` with `lang=latex`; the editor shows the source in a CodeMirror
  block with a KaTeX *preview toggle*, not live display math. Export emits
  `<pre><code class="language-latex">`; post-process latex blocks with
  `katex.renderToString({ displayMode: true })` to match the preview.
- **Mermaid — identical via the same post-render step** as the editor's
  NodeView (same mermaid instance/theme/id seeding).
- **Code blocks — needs a highlight pass** (editor = CodeMirror colors;
  export = plain `<pre><code>`). Reuse the app's existing highlighter.
- **App-specific syntax — must be ported into Milkdown.** Today's renderer
  implements `![Alt|640]` directives, floats, and `filetype=mp4` video
  embeds (`remarkImageDirectives` + custom components). Milkdown knows
  none of these; port the directive logic as a `$remark` plugin + image node
  attrs/toDOM, or those features regress in *both* editor and export.
- **Heading anchors** (`rehypeSlug`/`rehypeAutolinkHeadings`) are
  render-only niceties; add post-serialization if wanted.
- **CSS/theme is the real "same look" lever.** Identical DOM ≠ identical
  rendering: export must run under the same `.milkdown`/`--crepe-*` CSS
  scoped to the article container (or `.prose` styled to match), else
  fonts/spacing/colors diverge even with matching DOM.
- **Editor chrome** (toolbars, drag handles, caret, placeholders,
  code-block preview buttons) is intentionally absent — parity means the
  same *content*, not chrome.

Verdict: (B) can match the editor's *content* output with a handful of small
post-render steps (block-math, code highlight, mermaid) plus one CSS pass;
the app-specific directive/video syntax is the only substantive port. If
pixel parity with zero extra steps is the goal, (A) the read-only view is
the cheaper route.

Either way, react-markdown/remark/rehype can be dropped — a **net bundle
win** (KaTeX + Mermaid stay, already shared with the editor). Decision
needed: (A) read-only view for full article bodies, (B) static HTML, or
keep today's react-markdown rendering unchanged and use Milkdown only in
the editor (the current plan's scope).

## 4. Bundle impact — the decisive trade-off

Both go into a **single-file artifact** (`build.php` inlines every JS/CSS;
`frontend/vite.config.ts` forces `inlineDynamicImports: true` because the
artifact cannot fetch runtime chunks). Every byte is paid by **every**
visitor, including anonymous article readers.

Current artifact: 4.1 MB raw JS / ~1.1 MB gzip (+ 100 KB CSS, + 5.5 MB
inlined KaTeX fonts).

| | MDXEditor | Muya | Milkdown (`@milkdown/crepe`) |
|---|---|---|---|
| Added raw (main entry) | ~1.7 MB | ~2 MB (`lib/es/index.js`) + dynamic chunks | ~2.6 MB (all chunks, inlined) |
| Added gzip | ~560 KB | **~3.7 MB** (all Mermaid diagrams, Prism langs, Vega, Cytoscape, marked, turndown, rxjs, snabbdom — inlined) | **~0.89 MB** (KaTeX, CodeMirror 6, ProseMirror, remark, **Vue 3 runtime**) |
| Effective JS growth | ~1.5× | ~4× | ~2× |

Notes:
- Muya's published ESM build is pre-split into ~10.5 MB of dynamic chunks
  (one file per Mermaid diagram type, one per Prism language, Vega,
  Cytoscape…). With `inlineDynamicImports: true` all of it lands in the one
  bundle. If that setting were ever dropped, chunks would fail to load from
  the single PHP file, so inlining is effectively mandatory.
- Trimming options for Muya exist but are limited: Vega/PlantUML/flowchart
  could be disabled or shaken; Prism language set is configurable. Math +
  Mermaid stay (they are the point). §6 R1.
- The app already bundles Mermaid 11.16 + KaTeX for article rendering, so
  some bytes overlap, but Muya ships its own copies.
- Milkdown: Crepe's UI is built on **Vue 3** (hard dep) — ~35–45 KB gz of
  runtime the React app never uses. Its KaTeX copy overlaps the app's
  rendering bundle; features load via static imports, so
  `inlineDynamicImports` inlines as-is. No mermaid to dedupe (not included).

## 5. Key decisions (shared by both candidates)

1. **Meta fields leave the editor; front-matter is assembled on save.**
   Today `title`/`slug`/`date`/`tags` live in a hand-edited front-matter
   block inside the textarea and `parseMeta()` re-reads them on save. The
   backend stores `title`/`slug` as DB columns and derives `tags` from
   `content_md` front-matter (`src/api.php::front_matter_tags()`).
   Regardless of editor, move them to dedicated inputs in the editor header
   (title/slug required, date optional `YYYY-MM-DD`, new **tags** input);
   the editor receives only the body; a new `buildFrontMatter()` helper
   re-prefixes on save so the `pages.create`/`pages.update` contract is
   unchanged. (Muya *can* render an in-document front-matter block natively,
   but dedicated fields give the required-field validation the app needs.)
2. **The live preview pane is removed.** WYSIWYG styling with the app's
   `.prose` typography replaces it. MDXEditor additionally ships a source
   toggle; with Muya we add a minimal raw-markdown mode.
3. **Bundle growth is accepted.** ~560 KB gz (MDXEditor) or ~3.7 MB gz
   (Muya) added to the artifact. This is inherent to the single-file model
   (`inlineDynamicImports`). If Muya is chosen, the increase is large and
   should be a conscious call (see §4).
4. **Math/mermaid: either supported (Muya) or a documented limitation
   (MDXEditor).** With MDXEditor they round-trip as text/code but are not
   WYSIWYG-edited; with Muya they are fully editable. This is the core
   feature trade-off between the two.

## 6. Feature coverage

| Current editor | MDXEditor | Muya | Milkdown (`@milkdown/crepe`) |
|---|---|---|---|
| Plain-text markdown input | WYSIWYG + source toggle | WYSIWYG (+ our source mode) | WYSIWYG (+ our source mode) |
| Live side-by-side preview | removed (WYSIWYG prose) | removed (WYSIWYG prose) | removed (WYSIWYG prose) |
| GFM tables | ✅ | ✅ | ✅ |
| Task lists / strikethrough | ✅ | ✅ | ✅ |
| KaTeX math | ⚠️ text-only round-trip | ✅ WYSIWYG + round-trip | ✅ WYSIWYG + round-trip (Crepe `Latex`) |
| Mermaid | ⚠️ code block only | ✅ in-editor render | ⚠️ code block by default; custom node plugin adds render (§3c) |
| Image directives `![Alt\|640]` | ⚠️ verify round-trip (R3) | ⚠️ verify (R3) | ⚠️ verify (R3) |
| Front-matter hand editing | → dedicated fields | → dedicated fields | → dedicated fields |
| Code blocks + syntax highlight | CodeMirror 6 | Prism | CodeMirror 6 (Crepe) or Prism (`plugin-prism`) |
| Spellcheck off | ✅ `spellCheck={false}` | ✅ `spellcheckEnabled: false` | ✅ `editorViewOptionsCtx` attrs |
| i18n | via `translation` prop | bundled `zhCN`/`en` | ⚠️ hardcoded EN UI; per-string label overrides — needs zh pass |

## 7. Recommendation

**Milkdown (Crepe)** is now the strongest *balanced* choice. It is the only
candidate that pairs **real WYSIWYG KaTeX math** with **production-grade
maturity (v7, very active)**, an **official React 19 wrapper**, and a
**~0.89 MB gz** bundle — under a quarter of Muya's. The trade-offs: a small
**Vue 3 runtime** carried for Crepe's UI, **more i18n work** (hardcoded
English UI with per-string label overrides, vs Muya's bundled `zhCN`), and
**mermaid** is not built in — but it *can* be added as a ~150-line custom
node plugin at zero extra bundle cost (§3c), and Milkdown can double as the
article **renderer** to unify edit and display (§3d).

**Muya** remains the pick *only if* WYSIWYG **mermaid** editing is a hard
requirement — it is the sole option that renders diagrams in-editor — and
the ~3.7 MB gz growth plus v0.2.0 pre-1.0 risk are accepted (pin, watch).

**MDXEditor** drops to the fallback: no math and no mermaid WYSIWYG, but
still the lightest, most mature option with a built-in source toggle.

The rest of this plan assumes **Muya**; the **Milkdown variant** differs in
step 2 (`@milkdown/crepe` + `@milkdown/react`, `onUpload` → assets API,
`crepe.getMarkdown()`), step 4 (Crepe themes → glass tokens), and step 6
(per-string zh labels); the **MDXEditor variant** differs in step 2 (plugin
set + `ref.getMarkdown()`) and step 5 (Radix CSS vars).

## 8. Implementation plan (Muya)

1. **Add the dependency**
   - `cd frontend && pnpm add @muyajs/core` (pin the exact version).
   - Verify `pnpm run typecheck` passes before code changes.

2. **New component `frontend/src/components/editor/muya-editor.tsx`**
   - React wrapper: `useEffect` → `new Muya(containerRef.current, options)`
     → `muya.init()`; `destroy()` on unmount; expose `getMarkdown()` via
     `useImperativeHandle`.
   - Options: `{ markdown: body, math: true, footnote: true,
     superSubScript: true, frontMatter: false, mermaidTheme: <light/dark>,
     spellcheckEnabled: false, bulletListMarker: '-' }`; `muya.locale(lang)`
     from the app's i18n (`en`/`zhCN`).
   - Register UI plugins (`Muya.use(...)`) once, module-level: inline
     format toolbar, code-block language selector, paragraph menus, link
     tools, table toolbars, `PreviewToolBar`.
   - Wire `imageAction` to upload via the existing `assetsApi`/`assetUrl`
     (`frontend/src/lib/pages.ts`, `frontend/src/lib/api.ts`) so pasted or
     dropped images become `?module=asset&id=N` links.
   - A tiny **source-mode toggle** (sibling `<textarea>` + swap): read
     `muya.getMarkdown()`, edit raw, `muya.setContent()` on switch back.
   - Full-height scroll container; `focusMode: false`.

3. **Rework `frontend/src/pages/editor.tsx`**
   - Replace the two-pane grid with: header fields (Title, Slug, Date,
     Tags, status switch, delete/save) + the `MuyaEditor` in a
     `glass-control` panel.
   - Load: `parseFrontMatter(page.content_md)` → populate fields, pass
     `.content` as the editor's initial markdown.
   - Save: validate fields; `content_md = buildFrontMatter(...) +
     muyaRef.getMarkdown()`; keep the existing mutation/navigation flow.
   - Editor mounts once after `pageQuery` resolves (no re-init on re-render).

4. **`frontend/src/lib/front-matter.ts` — add `buildFrontMatter()`**
   - `buildFrontMatter({title, slug, date?, tags?})` → the `---` block
     (quoted title/slug, `tags: [a, b]` or omitted). `parseFrontMatter`
     unchanged (still used by article pages).

5. **Theming — `frontend/src/index.css`**
   - `@import '@muyajs/core/lib/style.css';`
   - Override Muya's editor colors with the app's glass tokens, plus a
     dark variant driven by `useTheme()`. Reduced-motion/reduced-
     transparency guards as elsewhere. `.prose` typography inside the
     contenteditable where sensible; unlayered overrides per AGENTS.md if
     Muya's own content rules fight `.prose`.

6. **i18n — `frontend/src/lib/i18n.ts`**
   - Update `editor.*` keys: drop preview keys, add field labels, tags,
     source-mode toggle labels; mirror in `zh`. Muya's own UI strings come
     from `muya.locale()` (bundled `en`/`zhCN`), no key maintenance needed.

7. **Docs**
   - AGENTS.md: note the editor, the `@muyajs/core` pin, bundle impact,
     the pre-1.0 API risk, and the source-toggle/theming conventions.

## 9. Risks & mitigations

- **R1 — Bundle growth (Muya ~3.7 MB gz).** Accepted if Muya is chosen
  (§4). Optional trimming: disable Vega/PlantUML/flowchart, restrict the
  Prism language set, dedupe the app's existing Mermaid/KaTeX. Revisit if
  the artifact becomes unwieldy; a code-split editor route is a larger
  follow-up that conflicts with the single-file model.
- **R2 — Markdown normalization on round-trip.** Muya re-serializes from
  its state on `getMarkdown()` (bullet markers, fences). Align options
  (`bulletListMarker: '-'`) with existing docs; verify with a diff of
  before/after on real articles.
- **R3 — Image-directive round-trip.** Verify `![Alt|640](url)` /
  `![Alt|center](url)` survives an edit cycle in both candidates. Muya
  parses alt text via its own lexer — needs a spike. If broken, add a
  small pre/post transform or migrate the format.
- **R4 — Muya pre-1.0 API churn.** Pin the exact version in
  `package.json`; keep an upgrade note in AGENTS.md. Contingency: if a
  later version breaks the wrapper, the plan's MDXEditor variant is a
  documented fallback.
- **R5 — Dark-theme fidelity.** Muya's core.css is light-only; custom
  overrides must cover the contenteditable, floating toolbars, dialogs,
  and KaTeX/Mermaid surfaces in both themes.
- **R6 — Front-matter churn.** Bodies stripped on load, re-prefixed on
  save; identical for existing docs. Docs without front-matter keep working
  (fields default to empty).
- **R7 — Custom Mermaid node (Milkdown only).** Async `mermaid.render()`
  needs lifecycle care (races, SVG cleanup, error fallback to editable
  source). Mermaid v11 API differs from the old plugin's sync call. Additive
  node serializes to a plain fence, so worst case is a non-rendering (but
  round-tripping) block — no content risk.
- **R8 — Rendering unification (Milkdown §3d).** Read-only view (A) is one
  ProseMirror instance per document (fine for article pages; listing cards
  keep text excerpts); static HTML (B) needs post-render steps for
  block-math → KaTeX, code highlighting, and Mermaid, plus a `.milkdown` →
  `.prose` CSS pass. **Both paths must port the app-specific image-directive
  and video-embed syntax into the Milkdown pipeline** or those features
  regress in editor *and* render. Keep react-markdown deps until the swap is
  verified on real articles.

## 10. Verification (no browser per AGENTS.md)

- `pnpm run typecheck` and `php build.php` (dev + `rel.sh`) succeed; the
  artifact contains the editor CSS/JS (and KaTeX/Mermaid for Muya).
- `php -l dist/index.php` passes.
- curl smoke: create → get → update a page with a body containing a table,
  task list, image directive, ` ```mermaid ` block, and `$math$`; confirm
  `content_md` round-trips (R3) and `tags` is parsed from the assembled
  front-matter.
- Code inspection: editor mounts once, source toggle present, save reads
  `getMarkdown()`.

## 11. Open questions (for review)

1. Confirm the editor choice: **Milkdown/Crepe** (math ✅, mermaid via a
   custom ~150-line plugin, ~0.89 MB gz, v7 mature, i18n label pass + Vue
   runtime) vs **Muya** (math+mermaid ✅ built-in, ~3.7 MB gz, v0.2.0
   pre-1.0) vs **MDXEditor** (~560 KB gz, mature, no math/mermaid WYSIWYG).
   §7 recommends Milkdown; Muya only if in-editor mermaid must be built-in.
2. Confirm **meta fields move out of the markdown** into dedicated
   title/slug/date/tags inputs (Decision 1).
3. Confirm **the live preview pane is deleted** in favor of WYSIWYG
   (+ a Muya source-mode toggle) (Decision 2).
4. Confirm the **tags input** is wanted (today tags are only editable by
   hand-editing front-matter).
5. Is **WYSIWYG mermaid editing** a hard requirement? If yes: Muya
   (built-in) or Milkdown + the §3c custom plugin (~a day of work, zero
   bundle cost). If no: Milkdown is the strongest balanced pick (§7).
6. Should **Milkdown also render articles** (§3d)? Read-only view (A) for
   best parity, static HTML (B) to keep `.prose`, or leave today's
   react-markdown rendering untouched and use Milkdown only in the editor?
