# Plan — Replace Side-by-Side Markdown Editor (MDXEditor vs Muya)

Scope: swap the current two-pane **textarea + live preview** editor
(`frontend/src/pages/editor.tsx`) for a WYSIWYG Markdown editor. Two
candidates were researched in depth — **MDXEditor** (`@mdxeditor/editor`)
and **Muya** (`@muyajs/core`, the Mark Text editor core). Article
*rendering* (the `Markdown` component on `/article` pages and home) is
**not** touched; only the editing surface changes. Storage format
(`content_md` = full markdown with YAML front-matter) is preserved either
way.

---

## 1. Candidates at a glance

| | MDXEditor | Muya (`@muyajs/core`) |
|---|---|---|
| Version | 4.2.0 (Jul 2026) | 0.2.0 (Jun 2026) |
| License | MIT | MIT |
| Adoption | ~1.2M weekly npm downloads | extracted from Mark Text (60k★) |
| React 19 | ✅ (`>=18 \|\| >=19` peer) | ✅ (framework-agnostic, plain DOM class) |
| Architecture | Lexical + micromark/mdast | custom block tree + OT JSON state (`ot-json1`) |
| **Math (KaTeX) editing** | ❌ none | ✅ WYSIWYG, round-trips `$..$`/`$$..$$` |
| **Mermaid editing** | ❌ (code block only) | ✅ rendered in-editor + round-trips ` ```mermaid ` |
| Diagrams (Vega/PlantUML/flowchart) | ❌ | ✅ |
| Source-mode toggle | ✅ built-in (`diffSourcePlugin`) | ❌ (Mark Text's Source Mode is app-layer, not core) — we build a simple one |
| Front matter | free-form plugin | ✅ native (`frontMatter: true`, yaml/toml) |
| GFM tables / task lists | ✅ | ✅ |
| Code blocks | CodeMirror 6 | Prism highlight + language selector |
| i18n | translation prop (bring your own) | ✅ 9 bundled locales incl. `zhCN` |
| Dark theme | Radix CSS vars (`dark-theme` class) | none in core.css — custom CSS overrides |
| Production readiness | mature, v4 | **README: "not yet recommended for production use; APIs may change between minor versions"** |
| Bundle (full graph, min+gz) | ~1.7 MB / **~560 KB gz** | ~12.5 MB / **~3.7 MB gz** (see §4) |

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

## 4. Bundle impact — the decisive trade-off

Both go into a **single-file artifact** (`build.php` inlines every JS/CSS;
`frontend/vite.config.ts` forces `inlineDynamicImports: true` because the
artifact cannot fetch runtime chunks). Every byte is paid by **every**
visitor, including anonymous article readers.

Current artifact: 4.1 MB raw JS / ~1.1 MB gzip (+ 100 KB CSS, + 5.5 MB
inlined KaTeX fonts).

| | MDXEditor | Muya |
|---|---|---|
| Added raw (main entry) | ~1.7 MB | ~2 MB (`lib/es/index.js`) + dynamic chunks |
| Added gzip | ~560 KB | **~3.7 MB** (all Mermaid diagrams, Prism langs, Vega, Cytoscape, marked, turndown, rxjs, snabbdom — inlined) |
| Effective JS growth | ~1.5× | ~4× |

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

| Current editor | MDXEditor | Muya |
|---|---|---|
| Plain-text markdown input | WYSIWYG + source toggle | WYSIWYG (+ our source mode) |
| Live side-by-side preview | removed (WYSIWYG prose) | removed (WYSIWYG prose) |
| GFM tables | ✅ | ✅ |
| Task lists / strikethrough | ✅ | ✅ |
| KaTeX math | ⚠️ text-only round-trip | ✅ WYSIWYG + round-trip |
| Mermaid | ⚠️ code block only | ✅ in-editor render |
| Image directives `![Alt\|640]` | ⚠️ verify round-trip (R3) | ⚠️ verify (R3) |
| Front-matter hand editing | → dedicated fields | → dedicated fields |
| Code blocks + syntax highlight | CodeMirror 6 | Prism |
| Spellcheck off | ✅ `spellCheck={false}` | ✅ `spellcheckEnabled: false` |
| i18n | via `translation` prop | bundled `zhCN`/`en` |

## 7. Recommendation

**Muya** is the better fit *if* the ~3.7 MB gzip bundle growth is
acceptable and the v0.2.0 pre-1.0 status is managed (pin the version,
watch for breaking changes). It is the only option that delivers real
WYSIWYG math + mermaid editing — the explicit goal. **MDXEditor** remains
the fallback if bundle size or pre-1.0 risk win; it is lighter,
production-grade, and has a built-in source toggle, at the cost of
math/mermaid editing.

The rest of this plan assumes **Muya**; the MDXEditor variant differs only
in step 2 (plugin set + `ref.getMarkdown()`) and step 5 (Radix CSS vars).

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

1. Confirm the editor choice: **Muya** (math/mermaid, ~3.7 MB gz, v0.2.0)
   vs **MDXEditor** (~560 KB gz, mature, no math/mermaid). §7 recommends
   Muya if the bundle is acceptable.
2. Confirm **meta fields move out of the markdown** into dedicated
   title/slug/date/tags inputs (Decision 1).
3. Confirm **the live preview pane is deleted** in favor of WYSIWYG
   (+ a Muya source-mode toggle) (Decision 2).
4. Confirm the **tags input** is wanted (today tags are only editable by
   hand-editing front-matter).
