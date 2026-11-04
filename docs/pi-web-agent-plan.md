# pi-web-agent-plan.md — Local-first web agent on Pi (pi-ai + pi-agent-core)

Scope: adding a **local-first web agent** to the sifpress single-file app, built on
the Pi agents framework — specifically `@earendil-works/pi-ai` (LLM layer) and
`@earendil-works/pi-agent-core` (agent loop). The agent runs entirely in the
browser SPA, operates on the user's local content (and the web), and keeps its
state (conversations, keys, sessions) on the device.

**Decisions locked in review:** Tier 1 auth (local keys only), a broad provider
set, read **and** write tools, best-effort `fetch_url`, an in-editor agent panel
(sessions as accordions, no separate page) with the current draft injected as
context, agent settings in System settings with a per-provider test-connection
button, and browser-only IndexedDB persistence. Remaining minor open questions
are at the end.

---

## 1. Research summary (what Pi actually is)

The Pi monorepo (`earendil-works/pi`, ~91k stars, MIT) is a layered TypeScript
toolkit. The two layers we care about:

**`@earendil-works/pi-ai` (0.84.2)** — unified multi-provider LLM API.
- One `Models` collection (`createModels()`) + provider factories
  (`@earendil-works/pi-ai/providers/openai`, `.../anthropic`, etc.). OpenAI,
  Anthropic, Google, DeepSeek, Groq, OpenRouter, xAI, Mistral, … and **any
  OpenAI-compatible endpoint** (Ollama, vLLM, LM Studio) via `createProvider()`.
- Streaming events: `text_delta`/`toolcall_delta`/`thinking_delta`, `done`,
  `error`; abort via `AbortSignal`. Unified `streamSimple`/`completeSimple` with
  a cross-provider `reasoning` level.
- Tools defined with **TypeBox schemas**; validation built in.
- **Auth is pluggable**: in the browser there are no env vars, so you pass
  `apiKey` explicitly or inject a **`CredentialStore`** (contract:
  `read/modify/delete`) and let provider auth resolve from stored credentials.
  We write a `localStorage`-backed store.
- **Browser support is first-class** (core entrypoint is side-effect free,
  bundles cleanly). Exceptions: Bedrock and provider OAuth login flows are
  Node-only (lazy-loaded, only break if actually invoked).

**`@earendil-works/pi-agent-core` (0.84.2)** — stateful agent loop on top.
- `new Agent({ initialState, streamFn: models.streamSimple.bind(models), … })`
  with `prompt()`, `continue()`, steering/follow-up queues, `abort()`.
- Emits UI events: `message_start/update/end`, `tool_execution_start/end`,
  `turn_start/end`, `agent_start/end` — exactly what a chat UI needs to render
  streaming text and tool activity.
- Tools via `AgentTool` (`name`, TypeBox `parameters`, `execute(toolCallId,
  params, signal, onUpdate)` → `{ content, details }`; **throw** to report an
  error; `terminate: true` to end the loop).
- Hooks: `beforeToolCall` / `afterToolCall` / `shouldStopAfterTurn`.
- Deps (`diff`, `yaml`, `ignore`, `typebox`, pi-ai, pi-telemetry) are all
  runtime-agnostic — confirmed **browser-safe**.
- **Caveat**: the official SQLite session backend
  (`@earendil-works/pi-session-backend-sqlite-node`) uses `node:sqlite` — not
  usable in a browser. We persist sessions/messages ourselves (IndexedDB).

Both packages are **pre-1.0 and fast-moving** (0.84.x, weekly releases) and
version-locked to each other (`pi-agent-core ^0.84.2` → `pi-ai ^0.84.2`). Pin
exact versions (`pnpm add --save-exact`).

---

## 2. Where the agent runs — client-side in the SPA

The artifact is a single PHP file with no Node process, so there is no server to
run an agent loop on. Pi is explicitly designed to run in the browser, so:

- **Agent loop + LLM transport run in the React SPA** (the browser tab).
- This is what makes it *local-first*: the harness, conversation state, tool
  definitions, and credentials live on the user's device. The only network calls
  are (a) the LLM provider (or a local Ollama) and (b) the existing sifpress
  JSON API for content tools.
- It works offline for everything except the LLM call itself; with a local
  Ollama endpoint it is fully self-contained.

## 3. LLM connectivity — v1: direct from browser, local keys

`createModels({ credentials: localStorageStore })` + a provider set. The user
enters their own keys in agent settings; they are stored in `localStorage` via
the `CredentialStore` and sent straight to the provider by pi-ai (explicitly
supported; the keys never leave the device except to the provider the user chose).

**The custom OpenAI-compatible (Ollama) option is the default and most
prominent** — a `createProvider()`-built provider pointing at
`http://localhost:11434/v1`, no key required, the purest local-first setup. A
fresh conversation defaults to it (models resolved at runtime from the local
server via `models.refresh()`).

**Provider set (locked "broader set")** — register these factories individually
(never `providers/all`, see §8):

- custom OpenAI-compatible provider for Ollama/vLLM/LM Studio — **default**,
  listed first in the UI (base URL user-configurable in settings)
- `openaiProvider` (GPT, etc.)
- `anthropicProvider`
- `openrouterProvider`
- `deepseekProvider`
- `groqProvider`

> **CORS is the one thing to verify per provider** (milestone 1). OpenAI /
> Anthropic / OpenRouter expose browser-friendly endpoints, but every provider
> in the set must be smoke-tested from the browser. A PHP LLM proxy
> (`?module=proxy`, pi-agent-core `streamProxy`) stays as the documented phase-2
> fallback if any chosen provider blocks CORS. OAuth login flows are out of
> scope (Node-only in pi-ai).

---

## 4. State & persistence — browser-only IndexedDB

- **Sessions / messages** → IndexedDB via a small hand-rolled adapter (no new
  dependency; a few dozen lines). Persist `AgentMessage[]` + metadata (title,
  model id, provider, system prompt, created/updated). Hydrate on page load;
  save on `message_end` / `agent_end`.
- **Credentials** → a `localStorage`-backed `CredentialStore` implementing
  pi-ai's `read/modify/delete` contract.
- No server schema changes. Multi-device sync is out of scope (documented for
  the future).

---

## 5. Agent tools (v1 = read + write, gated)

Tools wrap the existing JSON API (`?module=api&action=…`), reusing
`frontend/src/lib/api.ts`. **Server-side RBAC stays the source of truth**: write
actions are authorized server-side exactly as they are today (`pages.write` +
ownership or admin), so the agent gains no new privileges — it just calls the
same endpoints the editor uses. On top of that, write tools go through a
**client-side confirm gate**.

| Tool | Implementation | Notes |
|------|----------------|-------|
| `search_content` | `pages.search` (FTS, trigram) | optional `tag` filter |
| `read_page` | `pages.get` by slug/id | returns title + markdown body |
| `list_pages` | `pages.list` (filtered to readable) | browse catalog |
| `list_tags` | `tags.list` | |
| `fetch_url` | fetch → text/markdown | best-effort v1; CORS-permissive sites only; PHP fetch relay is phase 2 |
| `create_page` | `pages.create` | **write**: confirm gate + server authz |
| `update_page` | `pages.update` | **write**: confirm gate + server authz |
| (context) | current editor draft injected into the system prompt | when the agent page is opened from `/editor` |

**Write confirm gate (design note).** Write tools run with
`executionMode: 'sequential'` and their `execute()` awaits a UI confirmation
(promise resolved by a dialog) before calling the API. The dialog shows the
proposed diff/body so "the agent can't silently change content." `pages.delete`
is deliberately excluded from v1.

---

## 6. UI

- **In-editor panel, no separate page.** The agent lives in a collapsible
  right-hand rail on the editor page: a thin vertical toggle button sits beside
  the content section and expands/collapses the agent panel (following the glass
  design system).
- **Sessions as accordions.** The panel lists persistent sessions as accordions
  (title + expand/collapse + delete); the newest session is always expanded and
  marked "Active". The composer at the bottom of the panel always targets the
  latest session; older sessions are view-only archives.
- **Editor context injection**: the current draft (slug/title/markdown body) is
  injected into the agent's system prompt on every send, so the agent always
  sees the latest draft state. `update_page` still needs the confirm gate.
- **Streaming**: subscribe to agent events — `message_update` text deltas render
  into the active bubble; `tool_execution_start/end` render compact tool chips
  (write tools get a highlighted "pending confirm" chip); abort button wired to
  `agent.abort()`.
- **Assistant replies rendered with the existing `MarkdownView`**
  (`src/lib/marked/view.tsx`) so mermaid/KaTeX/images work in chat.
- **Settings live in System settings** (`/settings` → system tab): per-provider
  API key inputs (stored via CredentialStore), a **Test connection** button per
  provider (issues a minimal completion via `models.completeSimple`), Ollama
  base URL config, and a refresh-models button.
- **Model/thinking selectors** appear compactly above the composer.
- **i18n**: en/zh keys in `src/lib/i18n.ts` (existing pattern).

---

## 7. Repository layout (new pieces)

```
frontend/src/lib/agent/
  models.ts        # createModels + provider set + localStorage CredentialStore + testConnection
  store.ts         # IndexedDB session/message adapter (no deps)
  agent.ts         # buildAgent(): Agent + tools + event wiring
  tools.ts         # pages.* + fetch_url AgentTool definitions
  confirm.ts       # write-confirm gate (modal promise) injected into write tools
frontend/src/components/agent/
  agent-chat.tsx       # reusable chat panel (sessions as accordions, composer)
  agent-settings.tsx   # settings card mounted on the /settings system tab
  confirm-dialog.tsx   # shared write-confirm modal
frontend/src/pages/editor.tsx     # vertical toggle button + AgentChat rail
frontend/src/pages/settings.tsx   # AgentSettingsCard in the system tab
frontend/src/lib/i18n.ts          # en/zh keys
frontend/package.json             # + @earendil-works/pi-ai, pi-agent-core (exact pins)

# Phase 2 (optional, not in v1):
src/proxy.php        # ?module=proxy: LLM relay + fetch relay (CORS workaround)
src/router.php       # + module=proxy dispatch
build.php            # + proxy.php fragment to $parts
```

---

## 8. Build / bundle constraints (critical)

The frontend is built with **`codeSplitting: false`** and inlined into the PHP
artifact (`build.php` → single HTML). Consequences for Pi:

1. **Register the provider set individually, never `providers/all`.** pi-ai
   lazy-loads provider SDKs via dynamic imports; with code-splitting disabled
   they fold into the one bundle. `providers/all` would also drag in Bedrock's
   Node-only import. Each factory we register adds its SDK bytes — the "broader
   set" (§3) is the accepted tradeoff, and dropping/adding a provider later is a
   one-line change in `models.ts`.
2. **Bedrock must never be imported** — its AWS SDK is loaded through a
   bundler-opaque Node-only import. We simply never reference it.
3. **Milestone 1 is a spike** to confirm Vite/Rolldown accepts pi-ai's lazy
   chunks with `codeSplitting: false` and produces a buildable single bundle
   (no Node builtins leaked into the browser graph). Measure the bundle delta
   and trim the provider set if needed.
4. **Pin exact versions** (`--save-exact`): pre-1.0, weekly releases, and the
   two packages are co-versioned.

---

## 9. Risks

| Risk | Mitigation |
|------|-----------|
| Provider CORS blocks direct browser calls | Smoke-test every provider in milestone 1; drop offending providers or fall back to the phase-2 PHP proxy |
| Bundle size (several provider SDKs inlined into the one-file artifact) | Individual factory imports only; `openai` SDK is shared by OpenAI-compatible providers; measure in spike and trim if needed |
| pi-ai build breaks under `codeSplitting:false` / Node-only imports | Spike first; don't import Bedrock; adjust Vite config if needed |
| Write tools mutate content | Server RBAC unchanged (no new privileges); client confirm gate with visible diff; `pages.delete` excluded |
| Pre-1.0 version churn | Exact pins; re-verify on upgrade |
| IndexedDB quota on long conversations | Cap persisted messages per session (truncate / summary); revisit later |
| `fetch_url` CORS on arbitrary sites | Best-effort + documented; PHP fetch relay in phase 2 |
| No browser in this environment for testing | `pnpm run typecheck` + `php build.php` + curl; manual smoke test by you |

---

## 10. Implementation order

1. **Milestone 1 — spike (throwaway page).**
   `pnpm add --save-exact @earendil-works/pi-ai @earendil-works/pi-agent-core`.
   Minimal `Models` + `Agent` chat on a scratch route. Verify: browser streaming
   + a tool call against a real key (and Ollama); `pnpm run build` + `php
   build.php` succeed; CORS per provider in the §3 set; bundle delta size. Lock
   the final provider list from real numbers.
2. **Milestone 2 — persistence.** IndexedDB store; conversation list with
   create/rename/delete; hydrate + save messages around agent runs.
3. **Milestone 3 — read tools.** `search_content`, `read_page`, `list_pages`,
   `list_tags`; `fetch_url` (best-effort); editor-draft context injection;
   streaming tool chips in the UI.
4. **Milestone 4 — write tools + polish.** Confirm gate dialog; `create_page` /
   `update_page` (sequential mode); full agent page UI, settings (provider/model/
   per-provider keys/Ollama base URL/thinking level), `MarkdownView` rendering,
   i18n en/zh, empty/error/abort states.
5. **Milestone 5 — phase 2 (optional).** `?module=proxy` (LLM relay + fetch
   relay), server-synced sessions.

Each milestone ends with `pnpm run typecheck`, `pnpm run format`, `php
build.php`, and a `php -l`/curl sanity pass.

---

## 11. Remaining open questions (minor)

1. **Default model & thinking level** — a fresh conversation defaults to the
   custom OpenAI-compatible/Ollama provider (locked), with the model picked from
   whatever the local server exposes (first entry or most capable via metadata).
   Should the settings surface all `reasoning` levels (`off`/`low`/`medium`/
   `high`/…), and what should the default be for Ollama?
2. Anything else to add to the write-confirm gate (e.g. also confirm
   `fetch_url` targets before the agent follows them)?
