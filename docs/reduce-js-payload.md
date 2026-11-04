# Reduce the ui-sdk JS payload

PageSpeed flags `?p=sifpress/asset/js/ui-sdk.mjs` with ~1.76 MB transfer and
~1.48 MB unused on the measured page. This plan removes the unused code and
defers the heavy optional libraries.

## Diagnosis

| Resource | Raw | gzip | Lines | Served |
|---|---|---|---|---|
| `ui-sdk.mjs` (release) | 7,876,884 B | 1,820,833 B | 240,701 | `?p=sifpress/asset/js/ui-sdk.mjs&v=…` |
| `sifpress1.bundle.js` (release) | ~1.68 MB | ~65 KB | 3 | `?p=sifpress/sifront-bundle…` |

`ui_sdk/vite.config.ts` builds one monolithic ES lib (`codeSplitting: false`)
that eagerly imports everything:

- `ui_sdk/src/sifpress-ui.ts` imports all Crepe editor features + all Milkdown
  kits to populate `window.SifpressUI`.
- `ui_sdk/src/index.ts` → `markdown/index.ts` statically re-exports `mermaid`,
  `postprocess` (KaTeX + highlight.js), `render`, `shared` (Crepe builder +
  CodeMirror).

So mermaid (~3.5 MB min), KaTeX, highlight.js, Vue, CodeMirror, ProseMirror and
Milkdown are all in the core, and the sifront shell (`src/spa.php` →
`sifront_shell_html`) loads it eagerly on every page. The home page uses almost
none of the markdown/editor code.

Release minification is also weak: Vite 8/rolldown resolves `minify: 'esbuild'`
in **lib ES mode** to `{ compress, mangle, codegen: false }`, which keeps
whitespace. esbuild post-minify would give 5.4 MB raw / 1.56 MB gzip.

## Constraints

1. **Single-file artifact + `?p=` URLs.** Everything is embedded in
   `dist/*.php` and served by `?p=sifpress/asset/js/…`. Vite's default
   `/assets/chunk-*.mjs` URLs will 404, so chunk URLs must use the `?p=` scheme.
2. **`window.SifpressUI` global contract.** `build/vite-external-globals.ts`
   rewrites imports in the admin/sifront bundles to read `window.SifpressUI.*`
   synchronously at module-eval. Lazy code must not be destructured at top level.
3. **Shared Milkdown schema.** Editor and renderer must use the same Milkdown
   instance/schema (`ui_sdk/src/markdown/shared.ts`); a lazy chunk must be a
   single cached module shared by both.

## Target architecture

```
ui-sdk.mjs           core    React/ReactDOM/React Query/React Router/i18n,
                             api/base-url/pages/front-matter/rewrite,
                             light markdown helpers + lazy MarkdownView shim
ui-sdk-markdown.mjs  lazy    Milkdown/Crepe render + edit pipeline, and the
                             window.SifpressUI.Milkdown namespace the admin
                             editor externalizes to
ui-sdk-mermaid.mjs   lazy    mermaid
ui-sdk-katex.mjs     lazy    katex
ui-sdk-highlight.mjs lazy    highlight.js
```

Chunks are separate Vite lib entries served by name. A tiny loader injects a
`<script type="module" src="?p=sifpress/asset/js/<name>&v=…">` and waits for
`onload`; the chunk assigns its library onto `window.SifpressUI.Libs.<name>`.
This avoids Vite's chunk-URL machinery entirely.

Load graph:

- Home: core only.
- Article: core + mermaid/KaTeX/highlight only when the article uses them.
- Admin editor: core (+ lazy chunks).

## Phases

### Phase 0 — minify + compression (done)
- `ui_sdk/vite.config.ts`: `rolldownOptions.output.minify = true` so lib ES
  output is fully minified (not just identifier-mangled).
- `serve_ui_sdk()` / `serve_sifront_bundle()`: gzip when the client accepts it,
  `Vary: Accept-Encoding`. (Cloudflare already compresses the live site; this
  helps self-hosted deployments and the dev server.)

### Phase 1 — multi-chunk embed + serve (done)
- `build.php` embeds every `ui_sdk/dist/*.mjs` into `UI_SDK_CHUNKS` (name →
  content) and keeps `UI_SDK_VERSION` = hash of the core bundle.
- `src/router.php` routes `asset/js/<file>.mjs` → `serve_ui_sdk($file)`.
- `base_url_meta()` injects `window.SIFPRESS_UI_VERSION` so the loader can
  version chunk URLs.

### Phase 2 — lazy optional renderers (done)
- `ui_sdk/src/lazy-chunks.ts`: `loadUiChunk(file, ready)`.
- `ui_sdk/src/chunks/{mermaid,katex,highlight}.ts`: standalone entries that
  assign onto `window.SifpressUI.Libs`.
- `markdown/mermaid.ts`, `markdown/postprocess.ts`: load on demand only when a
  diagram / math block / code block is present.

### Phase 3 — split the markdown render pipeline (done)
- `ui_sdk/src/sifpress-ui.ts` no longer imports `@milkdown/*`; the namespace
  moved to `ui_sdk/src/milkdown-globals.ts`, published by the markdown chunk.
- `ui_sdk/src/markdown-lazy.tsx` exports the thin core shims (`MarkdownView`,
  `loadMarkdown`, `markdownToHtml`, `createMarkdownEditor`, …); `ui_sdk/src/index.ts`
  re-exports `markdown/light` (pure helpers) plus those shims.
- `ui_sdk/src/chunks/markdown.ts` imports the full `markdown/` barrel and
  `milkdown-globals.ts`, then sets `window.SifpressUI.Milkdown` and
  `window.SifpressUI.Libs.markdown`. Built with `externalGlobals({ milkdown: false })`
  so it consumes the core's React but bundles Milkdown itself.
- The admin HTML preloads the markdown chunk (`build.php` injects the tag next
  to the core script) because the admin editor reads
  `window.SifpressUI.Milkdown[…]` at module-eval and `codeSplitting: false`
  keeps the editor in the single admin bundle. The sifront does **not** preload
  it — `MarkdownView` loads it lazily on article pages only.
- `image-directives.ts` was split: pure helpers stay in the core,
  `imageDirectivesSchema` moved to `image-directives-schema.ts`.

### Phase 4 — editor chrome chunk (skipped)
- The Crepe chrome features stay in `ui-sdk-markdown.mjs`. Splitting them into
  a third chunk would only help the article page (the admin preloads both
  anyway), and the saving is marginal versus the added loader complexity.
  Revisit only if the article page payload becomes a target.

### Phase 5 — slim public core (todo)
- Add a sifront-only core entry exposing just the globals the sifront bundle
  references (React, JSX runtime, ReactDOM/Client, ReactQuery, ReactRouter,
  `sdk` with api/base-url/pages/front-matter/rewrite + `MarkdownView`).
- Point `sifront_shell_html()` at it; keep the full core for admin.

### Phase 6 — loading hints (todo)
- `modulepreload` the core only; prefetch the markdown chunk on article route
  mount (idle), never preload editor/lazy libs.

## Expected impact (gzip transfer)

| Page | Before | Phase 0–2 | Phase 3 |
|---|---|---|---|
| Home | ~1.76 MB | ~0.6 MB | **~0.14 MB** |
| Article (text) | ~1.76 MB | ~0.6 MB | ~0.14 + 0.44 MB |
| Article (mermaid/math/code) | ~1.76 MB | + on-demand | + on-demand |
| Admin (any page) | ~1.76 MB | ~0.6 MB | ~0.14 + 0.44 MB (markdown preloaded) |

Phases 5–6 (sifront-only slim core, prefetch hints) are still open if the home
page needs to shrink below ~140 KB.

## Results after Phase 0–2

Measured `pnpm run build:release` output (self-contained chunks, no relative
imports):

| Chunk | Raw | gzip | Loaded |
|---|---|---|---|
| `ui-sdk.mjs` | 1,839,623 B | 572,687 B | always |
| `ui-sdk-mermaid.mjs` | 3,386,549 B | 901,487 B | only when a diagram is rendered |
| `ui-sdk-katex.mjs` | 258,490 B | 76,661 B | only when a math block is rendered |
| `ui-sdk-highlight.mjs` | 155,549 B | 52,254 B | only when a code block is rendered |

The initial JS transfer dropped from ~1.76 MB to ~0.57 MB gzip. `serve_ui_sdk`
and `serve_encoded_text` now gzip the response; `dist/sifpress.php` shrank from
12.57 MB to 10.35 MB.

## Results after Phase 3

| Chunk | Raw | gzip | Loaded |
|---|---|---|---|
| `ui-sdk.mjs` | 445,187 B | 139,922 B | always |
| `ui-sdk-markdown.mjs` | 1,426,641 B | 443,685 B | article render / admin editor |
| `ui-sdk-mermaid.mjs` | 3,386,549 B | 901,487 B | only when a diagram is rendered |
| `ui-sdk-katex.mjs` | 258,490 B | 76,661 B | only when a math block is rendered |
| `ui-sdk-highlight.mjs` | 155,549 B | 52,254 B | only when a code block is rendered |

The core fell from 573 KB to **140 KB gzip**; the home page now loads the core
only. `UI_SDK_VERSION` hashes all chunks (not just the core) so any chunk change
busts the `immutable` cache.

## Verification

- `pnpm run build:release` in `ui_sdk`: check per-chunk raw/gzip sizes.
- `php build.php release` then `curl -H 'Accept-Encoding: gzip'` each chunk URL.
- No browser in this environment: rely on typecheck/build, `curl`, and manual
  Lighthouse by the maintainer.
