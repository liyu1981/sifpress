# reagent-package-plan.md — extract ReAgent into a standalone npm package

> Status: **implemented** (workspace package + Sifpress consumption; npm
> publish pending). Companion to `plan/agent-component-revamp.md` (which built
> ReAgent inside `admin_ui`). This plan moves it out and makes Sifpress one
> consumer of the package.

Goal: ReAgent becomes an installable React component library
(`@sifpress/reagent`, renameable) with **no dependency on Sifpress**, and
`admin_ui` consumes it — first via `workspace:*`, then via a semver range once
published. Sifpress-specific behavior (content search, tags, web fetch,
front-matter, Markdown rendering, asset upload, i18n) is injected through a host
adapter.

---

## 1. Locked decisions

1. **New workspace package** at `reagent/` (sibling of `admin_ui/`, `ui_sdk/`,
   `sifronts/`), published as **`@sifpress/reagent`** (scope/name easy to
   change before first publish). ESM-only + `types`; React 19 peer.
2. **ReAgent must not import `ui-sdk`, `@/lib/*`, or any `admin_ui` code.**
   Every Sifpress coupling is inverted through a host adapter.
3. **The package owns its UI primitives** (the shadcn components it uses:
   button, badge, input, label, switch, dropdown-menu, dialog, popover, tabs,
   tooltip, alert-dialog) plus `cn` and a confirm dialog, built on `radix-ui` +
   `class-variance-authority` + `clsx` + `tailwind-merge`.
4. **Styling is Tailwind v4 + CSS variables.** The package ships
   `@sifpress/reagent/styles.css` (token fallbacks + the `glass-control*` classes
   + the `[data-surface='solid']` rule) and tells Tailwind hosts to add
   `@source "<pkg>/dist"`. Token names (`--background`, `--card`, `--border`,
   `--muted-foreground`, `--primary`, `--accent`, `--destructive`, `--ring`) are
   the contract so a host theme restyles it for free.
5. **No `react-i18next` in the package.** It ships typed English defaults
   (`ReAgentMessages`) and accepts `messages` / `translate` overrides; Sifpress
   bridges from its i18n resources.
6. **No `sonner` in the package.** Notifications go through a `notify`
   callback; Sifpress wraps `toast`.
7. **`@earendil-works/pi-agent-core` + `pi-ai` are peerDependencies.** They are
   pre-1.0, version-locked, and the host already pins them; keeping them out of
   the package avoids a duplicate runtime and duplicate `AgentTool` type
   identity.
8. **Sifpress keeps the Sifpress-specific pieces**: content/tags/web tools,
   front-matter parsing, `MarkdownView`, asset upload, legacy `agent.*`
   localStorage migration, and its theme/i18n wiring.

---

## 2. Current coupling inventory

Everything under `admin_ui/src/{lib/agent,components/agent}`. External imports:

| Kind | Deps |
|------|------|
| npm | `react`, `react-i18next`, `lucide-react`, `sonner`, `class-variance-authority`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@modelcontextprotocol/sdk`, `radix-ui` (via primitives) |
| workspace | `ui-sdk` (3 sites) |
| app | `@/lib/front-matter`, `@/lib/md-editor`, `@/lib/theme`, `@/components/ui/*`, `@/components/confirm-dialog`, `@/lib/utils` (`cn`) |

### 2.1 The three `ui-sdk` couplings (the real blocker)

| Site | Uses | New home |
|------|------|----------|
| `lib/agent/tools.ts:5` | `pagesApi`, `tagsApi`, `webApi` for `search_content` / `list_tags` / `web_fetch` | **Host tool descriptors** injected via `extraTools` (move to `admin_ui/src/lib/agent/sifpress-tools.ts`) |
| `components/agent/ui/reagent-message.tsx:6` | `MarkdownView` | **Host renderer** `host.renderMarkdown` (default: plain `<pre>`) |
| `components/agent/core/reagent-provider.tsx:50` | `assetsApi`, `assetMarkdownLink`, `assetSourceUrl`, `makeVisionImage` | `makeVisionImage`/`blobToBase64` move **into the package** (app-agnostic canvas helper); the asset-upload fallback becomes `host.uploadFile` |

### 2.2 Other apps couplings

| Site | Coupling | Replacement |
|------|----------|-------------|
| `lib/agent/tools.ts:4` | `parseFrontMatter` in `update_frontmatter` | Move `get_frontmatter`/`update_frontmatter` to **host tools**; the package keeps the generic content/selection/commit-note tools |
| `lib/agent/editor-mutations.ts:13` | `EditorSelection` from `@/lib/md-editor` | Define a structural `ReAgentSelection` (`{ markdown, from, to }`) in the package; Sifpress's bridge satisfies it |
| `components/agent/ui/reagent-message.tsx` | `useResolvedTheme` | `theme: 'light' \| 'dark'` prop on `ReAgentProvider` |
| `components/ui/*`, `confirm-dialog` | Sifpress primitives | Copy into the package `src/primitives/` |
| `lib/utils` (`cn`) | tailwind-merge + clsx | Copy into the package |
| all `t('agent.*')` | `react-i18next` | `ReAgentMessages` + `messages` prop |
| `toast` (sonner) in settings panels | notifications | `host.notify(message, level?)` |
| `index.css` `.glass-control-opaque` + tokens | theming | Package `styles.css` (fallbacks) + host tokens |

### 2.3 Config + persistence

`config.ts` (localStorage `agent.config`), `session-store.ts` (IndexedDB
`sifpress-agent`), MCP Exa default, and `models.ts` credential store (`agent.*`
keys) all currently hardcode Sifpress names. The package will:

- namespace defaults to `reagent.*` / DB `reagent`,
- expose a `storage` adapter (default = localStorage + IndexedDB) and a
  `mcpServers` default (package default `[]`; Sifpress passes Exa),
- keep the **legacy `agent.*` → `reagent.*` migration in Sifpress** (a small
  helper run once before first render) so existing installs keep their sessions,
  keys and settings.

---

## 3. Target package architecture

```
reagent/
  package.json            name @sifpress/reagent, exports "." + "./styles.css"
  tsconfig.json
  tsup.config.ts          (or vite lib + tsc --emitDeclarationOnly)
  src/
    index.ts              public barrel
    core/
      types.ts            AgentConfig, AgentSession, descriptors, host types
      config.ts           namespaced config store (storage adapter)
      session-store.ts    IndexedDB store (namespaced DB)
      models.ts           createReAgentModels() (6 providers) + credential store
      skill-registry.ts   built-in skills + merged view
      tools.ts            generic descriptors; buildAgentTools()
      mcp.ts              MCP manager (default servers from host)
      agent.ts            buildAgent()
      attachments.ts      makeVisionImage / blobToBase64 (moved from ui-sdk)
      provider.tsx        ReAgentProvider + ReAgentContext
      hooks.ts            useReAgent / useReAgentSession / …
      messages.ts         ReAgentMessages (English defaults) + context
    ui/
      reagent.tsx         <ReAgent> preset (surface variant)
      reagent-root.tsx, reagent-header.tsx, reagent-message*.tsx,
      reagent-composer.tsx, reagent-sessions-view.tsx,
      settings/*.tsx
    primitives/
      button.tsx … tabs.tsx tooltip.tsx confirm-dialog.tsx utils.ts
    styles.css            token fallbacks, glass classes, solid-surface rule
```

### 3.1 Public API

```tsx
// preset
<ReAgent
  editor={…} draft={…} selection={…}
  surface="glass|solid"
  theme="light|dark"
  renderMarkdown={MarkdownView}
  extraTools={sifpressTools}
  uploadFile={…}
  mcpServers={…}
  messages={…}
  notify={…}
  storage={…}
  models={…}
  className={…}
/>

// headless
<ReAgentProvider …><ReAgentRoot>…parts + useReAgent*…</ReAgentRoot></ReAgentProvider>
```

```ts
export interface ReAgentHost {
  theme?: 'light' | 'dark';
  renderMarkdown?: ComponentType<{ content: string; theme?: 'light' | 'dark' }>;
  renderers?: Partial<{ markdown: ReAgentHost['renderMarkdown'] }>;
  extraTools?: AgentToolDescriptor[];
  editor?: EditorMutationBridge;
  uploadFile?: (file: File) => Promise<{ name: string; url: string; kind: string }>;
  notify?: (message: string, level?: 'success' | 'error') => void;
  mcpServers?: McpServerConfig[];
  messages?: Partial<ReAgentMessages>;
  storage?: ReAgentStorage;
  models?: MutableModels;
}
```

The provider reads these from props (or a nested `ReAgentHostProvider`) so the
preset can pass them straight through.

### 3.2 Frontmatter inversion

Add to the package's `EditorMutationBridge` only the generic surface
(`getContent/setContent/getSelection/updateSelection/openReview/getCommitNote/
setCommitNote`). Sifpress moves `get_frontmatter`/`update_frontmatter`
(including `parseFrontMatter` → `FrontMatterPatch`) into
`admin_ui/src/lib/agent/sifpress-tools.ts`, keeping `parseFrontMatter` in the app.

---

## 4. Packaging & build

- **Output**: `dist/index.js` (ESM), `dist/index.d.ts`, `dist/styles.css`.
  `exports`: `"."` → types+import, `"./styles.css"` → css.
- **Build**: `tsup` (esbuild; fast, emits d.ts) — simplest given `.tsx` + path
  aliases. Alternative (no new tool): `vite build --lib` for JS +
  `tsc --emitDeclarationOnly` for d.ts. Pick one in Phase 3.
- **Externalize**: `react`, `react-dom`, `@earendil-works/*` (peers) and keep
  `radix-ui`, `lucide-react`, `@modelcontextprotocol/sdk`, `cva`, `clsx`,
  `tailwind-merge` as real deps (bundled or imported — decide by size).
- **Tailwind**: `styles.css` contains the token fallbacks + glass/solid rules
  and a commented `@source` line; Sifpress's `index.css` adds
  `@source "../reagent/dist";` so the package's utility classes are generated by
  the host's Tailwind (standard v4 library pattern). Non-Tailwind consumers can
  opt into a prebuilt CSS in a later phase.
- **`codeSplitting: false`**: the package must not rely on code-splitting;
  pi-ai's lazy provider imports already fold into the Sifpress bundle today, so
  nothing changes as long as providers stay in `models.ts`.
- **`npm pack` check**: assert `dist/`, `styles.css`, no source maps to
  `admin_ui`, no `ui-sdk` reference.

---

## 5. Phased implementation

Each phase ends with `pnpm run typecheck` (package + admin_ui) and, where the
artifact changes, `php build.php`.

1. **Phase 0 — scaffold.** Create `reagent/` workspace package, add it to
   `pnpm-workspace.yaml`, tsconfig, build config, `index.ts` barrel. Move the
   `lib/agent/*` headless modules and `components/agent/**` UI verbatim. No
   behavior change; admin_ui still imports its local copy for now.
2. **Phase 1 — invert the host couplings.** Add `ReAgentHost` (theme,
   renderMarkdown, extraTools, uploadFile, notify, mcpServers, messages,
   storage, models). Replace the `ui-sdk`/`@/lib/*` imports per §2. Add
   `attachments.ts`. Move frontmatter tools out. Package-only build must pass
   with **zero** `@/`/`ui-sdk` imports (`rg` gate).
3. **Phase 2 — primitives + i18n + theme.** Copy the needed shadcn primitives,
   `cn`, and `confirm-dialog` into `src/primitives/`; replace `useTranslation`
   with `useMessages()`; replace `sonner` with `notify`; replace
   `useResolvedTheme` with the `theme` prop; port the glass/solid rules into
   `styles.css`.
4. **Phase 3 — build + publish dry run.** Wire tsup/vite lib, `exports`,
   peer/deps, `styles.css`; `pnpm --filter @sifpress/reagent build`;
   `npm pack` inspection; a tiny local consumer sanity check (`tsc` against the
   d.ts).
5. **Phase 4 — Sifpress consumes the workspace package.** Replace
   `@/components/agent/*` + `@/lib/agent/*` imports with `@sifpress/reagent`;
   add `admin_ui/src/lib/agent/sifpress-tools.ts`, the `MarkdownView` adapter,
   the `toast` notify adapter, the messages bridge, the asset `uploadFile`
   adapter, `mcpServers` (Exa), the `agent.*`→`reagent.*` migration, and the
   `@source` line. Delete the moved files and the `agent-chat.tsx` shim.
6. **Phase 5 — publish + pin.** Publish `@sifpress/reagent` (changesets or a
   manual `npm version`); switch admin_ui's dependency from `workspace:*` to
   `^x.y.z` after verifying `npm pack`; keep `pnpm-lock.yaml` updated.
7. **Phase 6 — docs + tests.** Package README (install, `@source`, host
   adapter, theming, headless usage); update `AGENTS.md`; optional Vitest for
   `config.ts`, `session-store.ts`, and the tool registry (node, no DOM
   needed).

---

## 6. Verification

- Package: `tsc --noEmit`, build, `npm pack --dry-run` (sizes + file list),
  and a grep gate that `src/**` has no `@/`, `ui-sdk`, or `admin_ui` imports.
- Sifpress: `cd admin_ui && pnpm run typecheck`, `pnpm run format`,
  `php build.php`, `php -l dist/index.php`, curl smoke of
  `?p=sifpress/admin/login` (HTTP 200, `ReAgent` + `@sifpress/reagent` present).
- **No browser** (per `AGENTS.md`): hover/stream/attachments/settings/sessions
  are verified by inspection + a manual pass.
- Regression checklist: existing sessions/settings carry over (migration),
  provider keys survive, Sifpress tools still listed in the Tools panel,
  Markdown still renders via `MarkdownView`, Exa MCP connects.

---

## 7. Risks

| Risk | Mitigation |
|------|-----------|
| Package's Tailwind classes not generated by the host | Ship `styles.css` + document `@source "<pkg>/dist"`; verify in Phase 4 build; offer prebuilt CSS fallback |
| Duplicate React / pi runtime or duplicate `AgentTool` types | `react`/`react-dom`/`@earendil-works/*` as peers; don't bundle them |
| `codeSplitting:false` + pi-ai lazy providers | Keep providers in the package's `models.ts` (same shape as today); confirm the Sifpress build |
| i18n refactor churn (every `t()` call) | `useMessages()` with the same key names; mechanical replacement; typed `ReAgentMessages` |
| Users lose sessions/settings on key rename | Explicit `agent.*`→`reagent.*` migration in Sifpress (Phase 4), tested against a seeded DB |
| Editor bridge type no longer matches | Structural `ReAgentSelection`; Sifpress's bridge already satisfies it; typecheck both sides |
| Package name taken / scope policy | Choose before Phase 5; the name is a single `package.json` field + import rewrite |
| Pre-1.0 pi churn | Peer + exact pins in the host (already the case); re-verify on upgrade |
| Splitting UI primitives creates drift with `admin_ui`'s | The package copies are the source for agent UI; `admin_ui` keeps its own for the rest of the app (acceptable duplication) |

---

## 8. Open questions

1. **Package name/scope** — `@sifpress/reagent` vs `reagent` vs `@reagent/react`?
2. **pi as peer vs dependency** — peer proposed (avoids duplication); a
   dependency is friendlier to outside consumers but risks two copies. Could
   ship both via `peerDependenciesMeta.optional` + a bundled fallback.
3. **CSS distribution** — Tailwind `@source` + host tokens (proposed) vs a
   precompiled, fully self-contained stylesheet. The former themes for free but
   requires Tailwind; the latter works anywhere but is rigid.
4. **ESM-only vs also CJS** — ESM-only proposed; add CJS only if a consumer
   needs it.
5. **Ship source or dist only** — dist + d.ts proposed; optionally ship `src`
   for Tailwind `@source` ergonomics.
6. **Does Sifpress keep a thin local preset?** e.g. a
   `SifpressAgent` wrapper binding MarkdownView/tools/messages, or call
   `<ReAgent>` directly at each site (only `editor.tsx` uses it today).
7. **Versioning/release** — changesets vs manual `npm version`; and whether CI
   publishes on tag.

---

## 9. Implementation notes (what shipped)

- **Package** `reagent/` → `@sifpress/reagent` `0.1.0`, ESM + `.d.ts`, built
  with `tsc -p tsconfig.build.json` (no new bundler). `exports` = `"."` +
  `"./styles.css"`; `files` = `dist`, `styles.css`, `README.md`. `npm pack`
  = 87 files / ~54 kB.
- **Dependencies**: `react`, `react-dom` and `@earendil-works/pi-*` are peers;
  `radix-ui`, `lucide-react`, `@modelcontextprotocol/sdk`, `cva`, `clsx`,
  `tailwind-merge` are deps. The UI primitives (button/badge/input/label/
  switch/dropdown-menu/dialog/popover/tabs/tooltip/alert-dialog/confirm-dialog)
  and `cn` are copied into `reagent/src/primitives` + `src/lib`.
- **Host adapters** live in `reagent/src/core/messages.ts` + `i18n.ts`
  (`translate`/`messages`, `notify`, `theme`, `renderMarkdown`) and the provider
  props; `SifpressReAgent` wires i18n, `MarkdownView`, `SIFPRESS_TOOLS`, sonner
  and `uploadFile`. `makeVisionImage`/`blobToBase64` moved into
  `core/attachments.ts`.
- **Deviations from §2.3**: storage keys/DB names were **kept unchanged**
  (`agent.config`, `agent.credential.*`, IndexedDB `sifpress-agent`, Exa
  default) to avoid a data-loss migration. Namespacing to `reagent.*` remains a
  follow-up. Sifpress still lists `@modelcontextprotocol/sdk` (now also a
  package dep) — harmless.
- **Styling**: `reagent/styles.css` is plain (unlayered) CSS with `:where(:root)`
  token fallbacks; Sifpress's `index.css` imports it and adds
  `@source "../../reagent/dist"`.
- **Deleted from `admin_ui`**: `lib/agent/*` (except the new
  `sifpress-tools.ts`), `components/agent/{core,ui,reagent.tsx,agent-chat.tsx}`,
  and the now-unused `components/ui/tooltip.tsx`. `editor.tsx` renders
  `SifpressReAgent`.
- **Verified**: package + admin `tsc`, `pnpm --filter @sifpress/reagent build`,
  `php build.php`, `php -l dist/index.php`, `npm pack --dry-run`, and a curl
  smoke of `?p=sifpress/admin/login` (HTTP 200). Still no browser, so the UI
  needs a manual pass. `npm publish` / switching `workspace:*` → `^0.1.0` is
  the remaining step.
