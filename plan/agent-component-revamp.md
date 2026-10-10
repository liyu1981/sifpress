# plan/agent-component-revamp.md — ReAgent: the agent as a composable React component

> Status: **implemented**. Companion to `plan/pi-web-agent-plan.md`,
> `plan/agent-composer-redesign.md`, `plan/mcp-support-plan.md`,
> `plan/selection-revision-plan.md`. This plan supersedes the *UI packaging*
> and *session-list* sections of `pi-web-agent-plan.md` (its tool/transport/
> persistence decisions still hold).
>
> The component set is named **ReAgent** (`<ReAgent>`, `ReAgentProvider`,
> `ReAgentComposer`, …, `useReAgent*`).
>
> **Implementation deltas** (see §11): the headless modules stayed in
> `admin_ui/src/lib/agent/` (a lower layer than `components/`) with only the
> React provider/hooks under `components/agent/core/`; `AgentConfig` lives in a
> localStorage-backed external store (no controlled `config` prop);
> `agent-chat.tsx` remains a deprecated re-export; the old `store.ts` /
> `skills.ts` shims were removed.

Three asks drive this revamp:

1. **Make the agent a React component in the shadcn style.** A composable,
   owned-in-repo component set: an unstyled foundation (context + parts) that
   imposes no look, plus a default styled composition built from those parts.
   Consumers can restyle with `className`/variants or swap sub-parts.
2. **Settings become part of the component.** LLM/model, system prompt,
   built-in + custom skills, and built-in + custom tools are all configurable
   through the component API, with **default settings UIs supplied** and
   **rendered as a tabbed view inside the component** (not on `/settings`).
3. **Kill the accordion session list.** One **active** session at a time.
   Sessions are browsed/loaded from a chooser, can **fork** from another
   session, and the chooser is a **tree** (Pi-code-agent style).

---

## 1. Locked decisions

1. **Three layers**: `core/` (headless: state, provider, hooks, registry — no
   styles), `ui/` (styled shadcn-style parts + default panels), and the preset
   `<ReAgent>` composed from the parts. The layers live in `admin_ui` (shadcn
   means "you own the code"); no new workspace package in this plan, but the
   `core/` layer must not import anything from `admin_ui` outside `ui-sdk` +
   pi + React so extraction stays a copy-paste later.
2. **One active session.** The transcript area shows the active session only.
   `sessionId` is the active pointer; all other sessions are cold-stored.
3. **Session tree.** `AgentSession` gains `parentId` + `forkFromIndex`
   (`AgentMessage` has no stable id, so a fork is anchored by message index /
   count). Deleting a session **reparents its children** to its parent.
4. **Single config store.** All agent knobs move into one versioned
   `AgentConfig` object with a migration from today's scattered localStorage
   keys. Credentials stay in the pi-ai `CredentialStore` (localStorage).
5. **Tools are descriptors.** Built-in tools become registry entries with ids;
   config can disable them per id, and consumers can register custom tools via
   a prop. The settings "Tools" panel is generated from the registry.
6. **Skills split into built-in + custom.** Built-in skills are code-defined
   descriptors (toggleable, read-only body); custom skills are the existing
   user-authored `AgentSkill` rows (CRUD).
7. **Settings UI is an in-component view.** The gear replaces the chat surface
   with the settings page (`view: 'settings'`) and a back button returns. Agent
   settings are self-contained, so the `/settings` My Account page has no Agent
   tab.
8. **Preset preserved.** `@/components/agent/reagent` exports the preset
   `ReAgent` with today's props (`draft`, `editor`, `selection`,
   `onClearSelection`, `onClose`, `className`); `editor.tsx` swaps its import
   from `AgentChat` to `ReAgent` (one line). A deprecated `AgentChat` alias is
   re-exported for one release.
9. **Name: ReAgent.** The component set is called **ReAgent**. The provider is
   `ReAgentProvider`; the default composition is `<ReAgent>`; every part and
   hook is `ReAgent*` / `useReAgent*` (shadcn compound naming, e.g.
   `ReAgentComposer`, `ReAgentMessageList`, `ReAgentSessionsView`). Core domain
   types keep their plain names (`AgentConfig`, `AgentSession`,
   `AgentToolDescriptor`) — they describe the agent, not the React component.
10. **Selection revision starts a fresh root**, never a fork (see §4.3): a
    "Revise selection" request always opens an isolated top-level session so
    the revision is not entangled with the currently open conversation.

---

## 2. Current state (what we are refactoring)

| File | Lines | Responsibility | Problem |
|------|------:|----------------|---------|
| `admin_ui/src/components/agent/agent-chat.tsx` | 1318 | The whole UI: session accordions, transcript, composer, attachments, model/thinking pickers, Exa key dialog, agent lifecycle + event wiring | Monolithic; mixes state, transport, and look; hard to restyle or embed |
| `admin_ui/src/components/agent/agent-settings.tsx` | 271 | Provider keys + Ollama URL + refresh | Reads localStorage directly; no shared state; card-only |
| `admin_ui/src/components/agent/system-prompt-settings.tsx` | 79 | Custom system prompt | Reads localStorage directly |
| `admin_ui/src/components/agent/skills-settings.tsx` | 215 | Custom skills CRUD | Reads localStorage directly; no built-in skills |
| `admin_ui/src/components/agent/mcp-settings.tsx` | 163 | MCP server toggles + Exa key | Reads localStorage directly |
| `admin_ui/src/lib/agent/models.ts` | 331 | pi-ai `Models`, providers, CredentialStore, verify/test, `listAvailableModels` | Scattered localStorage keys (`agent.credential.*`, `agent.verified.providers`, `agent.ollama.baseUrl`) |
| `admin_ui/src/lib/agent/store.ts` | 72 | IndexedDB sessions (`AgentSession[]`) | Flat list, no tree, no active pointer |
| `admin_ui/src/lib/agent/agent.ts` | 41 | `buildAgent()` | Fine as-is, needs config-aware tools |
| `admin_ui/src/lib/agent/tools.ts` | 312 | Hardcoded built-in tool list | No ids/registry, no per-tool enable/disable, no UI metadata |
| `admin_ui/src/lib/agent/skills.ts` | 143 | Custom skills + `use_skill` tool | No built-in skills, no registry |
| `admin_ui/src/lib/agent/prompt.ts` | 52 | Custom system prompt override | No `mode`/default handling in one config |
| `admin_ui/src/lib/agent/mcp.ts` | 380 | MCP clients → `AgentTool[]` | Tools not described in the registry |
| `admin_ui/src/pages/editor.tsx` | — | Bottom-sheet rail hosting `AgentChat` | Preset consumer; stays |

### 2.1 Problems this revamp fixes

- **Look is welded to state.** You cannot use the agent logic without the glass
  chat card, and cannot restyle it without editing 1300 lines.
- **Settings state is duplicated** across four cards + the chat, each reading
  localStorage on its own; changes don't propagate live.
- **Accordion list of every session** grows unbounded, renders every transcript,
  and has no concept of "the conversation I'm in".
- **No fork/branch** — a revision always starts from nothing.
- **Tools are a fixed array**; there is no way for a consumer to disable one or
  add a custom one through a supported API.
- **No built-in skills** — only user-authored ones.

---

## 3. Target architecture

### 3.1 Three layers

```
core/   headless — no styles, no DOM opinions
  types.ts            AgentConfig, AgentSession, AgentToolDescriptor, AgentSkillDefinition
  config.ts           load/save/migrate AgentConfig (localStorage 'agent.config')
  session-store.ts    IndexedDB v2: sessions + tree queries + fork/delete/reparent
  tool-registry.ts    built-in tool descriptors + buildAgentToolsFromRegistry()
  skill-registry.ts   built-in skills + merged view (built-in + custom)
  reagent-provider.tsx <ReAgentProvider> owns config, session tree, Agent instance
  hooks.ts            useReAgent / useReAgentSession / useReAgentSessions /
                      useReAgentConfig / useReAgentRegistry

ui/     styled, shadcn-style parts (each: className merge + variants, no app coupling)
  reagent-root.tsx
  reagent-header.tsx
  reagent-message-list.tsx
  reagent-message.tsx
  reagent-tool-call.tsx
  reagent-composer.tsx
  reagent-sessions-view.tsx
  settings/
    reagent-settings-view.tsx
    model-panel.tsx
    prompt-panel.tsx
    skills-panel.tsx
    tools-panel.tsx
    mcp-panel.tsx

reagent.tsx   preset: composes core/ui with the current glass styling (<ReAgent>)
```

`core/` imports only React, `@earendil-works/*`, `ui-sdk`, and `./*`. The
editor bridge stays an **injected prop** (`tools`/`editor`), so core is
host-agnostic.

### 3.2 Provider and hooks API

```tsx
// core/reagent-provider.tsx
interface ReAgentProviderProps {
  config?: AgentConfig;                     // controlled
  defaultConfig?: Partial<AgentConfig>;     // uncontrolled
  onConfigChange?: (config: AgentConfig) => void;
  persistence?: AgentPersistence | false;   // default: browser (config + IndexedDB)
  tools?: AgentToolDescriptor[];            // app-injected (editor, web, mcp)
  renderers?: Partial<AgentRenderers>;      // custom message / tool renderers
  children: ReactNode;
}

// core/hooks.ts
function useReAgent(): {
  agent: Agent | null;
  status: 'idle' | 'streaming' | 'error';
  streamingText: string;
  isThinking: boolean;
  toolCalls: AgentToolCallView[];
  error: string | null;
  send: (input: AgentSendInput) => Promise<void>;
  stop: () => void;
};

function useReAgentSession(): { session: AgentSession | null; messages: AgentMessage[] };
function useReAgentSessions(): {
  roots: AgentSessionNode[];
  activeId: string | null;
  create: () => Promise<AgentSession>;
  fork: (sourceId: string, atIndex?: number) => Promise<AgentSession>;
  load: (id: string) => Promise<void>;
  rename: (id: string, title: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
};
function useReAgentConfig(): { config: AgentConfig; update: (patch: Partial<AgentConfig>) => void };
function useReAgentRegistry(): { models: ModelOption[]; tools: AgentToolDescriptor[]; skills: AgentSkillDefinition[] };
```

State lives in a small external store (a `useSyncExternalStore`-friendly
reducer) rather than React state so the `Agent` event subscription and the
tree store can push into it without prop-drilling, and so multiple mounted
parts share one source of truth.

`autoSave`: on `agent_end` the active session is written back (as today), but
via the session store; the provider owns the subscription that the monolithic
component currently holds.

### 3.3 Config model

```ts
interface AgentConfig {
  version: 1;
  model: { providerId: string; modelId: string } | null;
  thinkingLevel: ThinkingLevel;
  providers: Record<string, { baseUrl?: string; verified?: boolean }>;
  systemPrompt: { mode: 'default' | 'custom'; custom: string };
  skills: AgentSkillConfig[];               // custom rows (id/name/description/content/enabled)
  skillsDisabledBuiltins: string[];         // built-in skill ids switched off
  toolsDisabled: string[];                  // built-in tool ids switched off
  mcp: McpServerConfig[];
  activeSessionId: string | null;
}
```

Migration from current keys (run once when `agent.config` is absent):

| Legacy key | New home |
|------------|----------|
| `agent.lastModel` | `config.model` |
| `agent.ollama.baseUrl` | `config.providers.ollama.baseUrl` |
| `agent.verified.providers` | `config.providers[*].verified` |
| `agent.skills` | `config.skills` |
| `agent.systemPrompt.custom` | `config.systemPrompt` (`mode: 'custom'` when non-empty) |
| `agent.mcp.servers` | `config.mcp` |
| `agent.credential.*`, `agent.mcp.exa.apiKey` | unchanged (CredentialStore / localStorage) |

Legacy keys are left in place (read-through) for one release, then dropped.

### 3.4 Tool & skill registries

```ts
interface AgentToolDescriptor {
  id: string;                               // stable, e.g. 'search_content'
  name: string;                             // pi tool name
  label: string;
  description: string;
  group: 'content' | 'editor' | 'web' | 'skills' | 'mcp';
  requiresEditor?: boolean;
  defaultEnabled?: boolean;                 // default true
  build: (ctx: { editor?: EditorMutationBridge }) => AgentTool<any>;
}
```

- `tools.ts` is refactored into `core/tool-registry.ts` that exports
  `BUILTIN_TOOLS: AgentToolDescriptor[]`; `buildAgentToolsFromRegistry({ editor,
  disabledIds, injected })` filters and merges. The existing 12 tools keep
  their names/descriptions verbatim (no behavior change).
- `buildSkillTools()` becomes a descriptor (`group: 'skills'`) built from the
  merged built-in + enabled-custom skill set.
- MCP tools are wrapped as app-injected descriptors (`group: 'mcp'`,
  `id: 'mcp__<server>__<tool>'`) so the Tools panel can list and toggle them.

```ts
interface AgentSkillDefinition {
  id: string;
  name: string;
  description: string;
  content: string;
  source: 'builtin' | 'custom';
  enabled: boolean;
}
```

Built-in skills ship in `core/skill-registry.ts` as a small starter set
(e.g. `seo-review`, `markdown-style`, `alt-text`) marked `source: 'builtin'`.
Only `enabled` + (for custom) body are persisted; built-in bodies are code.
`skillsSystemPrompt()` and `use_skill` read the merged list.

### 3.5 UI parts — shadcn conventions

Every part follows the house shadcn rules already used in
`admin_ui/src/components/ui/`:

- `React.forwardRef` where a DOM ref matters; `className` merged with `cn()`.
- Variants via `class-variance-authority` where the part has obvious looks
  (`AgentMessage` role variants, `AgentToolCall` status variants).
- `asChild` (Radix `Slot`) on trigger/button-like parts for composition.
- Controlled/uncontrolled where a part owns a small local toggle (e.g. the
  collapsible tool call).
- **No required styling**: the primitives render semantic elements with
  `data-slot` + `data-*` state attributes; the *preset* `ReAgent` (and the
  `settings/` panels) supply the glass classes. This is the "foundation has no
  standard style" requirement.
- Escape hatch: `renderMessage` / `renderers` props on
  `<ReAgentMessageList>` / `<ReAgentProvider>` for callers that want their own
  message markup.

Part catalog (`ReAgent` compound naming):

```
<ReAgentRoot>                    layout container (unstyled flex column)
  <ReAgentHeader>                chrome row
    <ReAgentSessionTitle />
    <ReAgentSessionTreeTrigger />  opens the sessions view
    <ReAgentNewSessionButton />
    <ReAgentForkButton />
    <ReAgentSettingsTrigger />     opens the settings view
    <ReAgentCloseButton />
  <ReAgentMessageList>           active transcript; renderMessage escape hatch
    <ReAgentMessage />           role variants: user | assistant | toolResult
      <ReAgentToolCall />        collapsible, status variants
  <ReAgentComposer>              form + submit/stop
    <ReAgentComposerSelectionChip />
    <ReAgentComposerAttachments />
    <ReAgentComposerInput />     auto-grow textarea
    <ReAgentComposerRow>
      <ReAgentComposerAttach />
      <ReAgentComposerStatus />  spinner / thinking
      <ReAgentThinkingPicker />
      <ReAgentModelPicker />
      <ReAgentSendButton />
```

### 3.6 Default settings UIs (in-component view)

`ui/settings/reagent-settings-view.tsx` (tabbed — Model · Prompt · Skills ·
Tools · MCP, with the back button in the header):

```
<ReAgentSettingsView>            replaces the chat surface, back button on top
  <ReAgentModelPanel />          provider keys + Ollama URL + test + refresh + default model/thinking
  <ReAgentPromptPanel />         custom prompt editor + load-default/reset ({{language}})
  <ReAgentSkillsPanel />         built-in toggles + custom CRUD (current skills editor)
  <ReAgentToolsPanel />          registry-generated list with switches (disabled -> greyed)
  <ReAgentMcpPanel />            MCP servers + Exa key
```

The settings trigger sets `view: 'settings'` in the provider; the view renders
in place of `<ReAgentHeader>/<ReAgentMessageList>/<ReAgentComposer>` inside the
same `<ReAgentRoot>`, and the back button restores `view: 'chat'`. The panels
are pure and context-driven, so they can be reused anywhere
(`useReAgentConfig()` reads the global `AgentConfig` store and does not require
the provider). Because the agent settings are now self-contained, the
`/settings` → My Account page **has no Agent tab**.

---

## 4. Session model: active-only + tree + fork

### 4.1 Data model

```ts
interface AgentSession {
  id: string;
  parentId: string | null;        // fork tree
  forkFromIndex: number | null;   // messages copied from the parent (null for roots)
  title: string;
  providerId: string;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  systemPrompt: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentMessage[];
}

type AgentSessionNode = AgentSession & { children: AgentSessionNode[] };
```

### 4.2 IndexedDB v2 migration

`store.ts` → `core/session-store.ts`, `DB_VERSION = 2`:

- `onupgradeneeded`: existing rows get `parentId = null`,
  `forkFromIndex = null`; add an index `by-parent` on `parentId`.
- New helpers: `listSessionNodes()` (builds the tree, sorted by `updatedAt`
  descending within a parent, roots most-recent-first), `getSession(id)`,
  `forkSession(sourceId, atIndex)`, `deleteSession(id)` (reparent children to
  the deleted node's parent), `setActiveSessionId` (stored in `AgentConfig`,
  mirrored for fast restore).

### 4.3 Fork semantics

- `fork(sourceId, atIndex = source.messages.length)`:
  - `messages = source.messages.slice(0, atIndex)`;
  - `parentId = sourceId`, `forkFromIndex = atIndex`;
  - new `id`, `createdAt = updatedAt = now`, title = `` `${source.title} › branch` ``
    (renameable);
  - persist, make active.
- **Fork from a message** (UI): each message gets a hover action *Branch from
  here* → `fork(activeId, index + 1)`. This is the message-level branch Pi
  exposes.
- **Duplicate** = `fork(activeId, active.messages.length)`.
- **Selection revision starts a fresh root** (locked): `create()` with
  `parentId = null`, regardless of the active session. The selection text is
  wrapped into the first prompt (as today), and the editor-draft context still
  rides in the system prompt, so isolation does not lose the document. This
  keeps every revision a clean, self-contained thread instead of a branch of
  whatever was open before.
- **New root chat**: `create()` with `parentId = null`.

### 4.4 Sessions view (`ui/reagent-sessions-view.tsx`)

- Opened by `ReAgentSessionTreeTrigger`: like the settings view, it **replaces
  the chat surface** inside the same `<ReAgentRoot>` (`view: 'sessions'`) and
  has a back button; the chat header title (`ReAgentSessionTitle`) still shows
  the active session.
- Renders the tree recursively: expand chevron (when children), title, active
  badge, relative time, message count; a `⋯` menu per node with **Load**,
  **Fork**, **Rename**, **Delete**.
- Search field filters titles; ancestors of matches stay visible.
- **New chat** at the top; footer shows count.
- Keyboard: ↑/↓ move, →/← expand/collapse, Enter load, `n` new, `f` fork.

### 4.5 Active-only chat

- `ReAgent` renders `useReAgentSession().messages` for the active session —
  no `sessions.map(...)` accordion.
- Switching sessions: `abort()` the current agent, persist the outgoing
  session, build an `Agent` for the target from its stored messages, and
  subscribe.
- The store keeps all sessions in memory as lightweight nodes (metadata) but
  only materializes the active transcript into React; `getSession(id)` reads
  full messages from IndexedDB on load.

---

## 5. File layout

New:

```
admin_ui/src/components/agent/
  core/
    types.ts
    config.ts
    session-store.ts
    tool-registry.ts
    skill-registry.ts
    agent-store.ts          # external store bridging Agent events + tree
    reagent-provider.tsx     # <ReAgentProvider> + ReAgent context
    hooks.ts
  ui/
    reagent-root.tsx
    reagent-header.tsx
    reagent-message-list.tsx
    reagent-message.tsx
    reagent-tool-call.tsx
    reagent-composer.tsx
    reagent-sessions-view.tsx
    settings/
      reagent-settings-view.tsx
      model-panel.tsx
      prompt-panel.tsx
      skills-panel.tsx
      tools-panel.tsx
      mcp-panel.tsx
  reagent.tsx               # preset <ReAgent> (was agent-chat.tsx)
```

Changed:

- `agent-chat.tsx` → renamed `reagent.tsx`, a thin preset composing `core/` +
  `ui/` with the existing glass styling; still exports today's props, plus a
  deprecated `AgentChat` alias.
- `lib/agent/tools.ts` → re-export / delegate to `core/tool-registry.ts`.
- `lib/agent/skills.ts` → built-in + custom merge via `core/skill-registry.ts`.
- `lib/agent/prompt.ts`, `models.ts`, `store.ts` → delegate to the config /
  session stores.
- `pages/settings.tsx` → panels instead of four cards.
- `pages/editor.tsx` → import `ReAgent` instead of `AgentChat` (props
  unchanged); the rail may move to the `ReAgentRoot` layout.

Deleted (after migration): the accordion rendering and per-card localStorage
reads in the four `*-settings.tsx` files.

---

## 6. Phased implementation

Each phase ends with `cd admin_ui && pnpm run format && pnpm run typecheck`,
plus `php build.php` for phases that touch runtime.

1. **Phase 1 — config store + registry (no UI change).**
   Add `core/types.ts`, `core/config.ts` (with legacy migration),
   `core/tool-registry.ts`, `core/skill-registry.ts`. Rewire `models.ts`,
   `prompt.ts`, `skills.ts`, `tools.ts` to read from the config store. Keep the
   old cards working (they now read the shared store). Verify with typecheck +
   a manual curl-triggered build.
2. **Phase 2 — headless provider + session tree store.**
   `core/session-store.ts` (IndexedDB v2 + fork/delete/reparent),
   `core/agent-store.ts`, `core/reagent-provider.tsx`, `core/hooks.ts`.
   Introduce `activeSessionId`. No visual change yet — `agent-chat.tsx` gets its
   state from `ReAgentProvider`.
3. **Phase 3 — active-only chat.**
   Remove the accordion list; render only the active transcript; add abort +
   rebuild on session switch. This is the first visible change.
4. **Phase 4 — sessions view.**
   `ui/reagent-sessions-view.tsx` + header trigger/title; new/load/fork/rename/
   delete; message-level *Branch from here*.
5. **Phase 5 — UI parts.**
   Split the remaining monolith into `ui/` parts using the house shadcn
   conventions; rename `agent-chat.tsx` → `reagent.tsx` and make `<ReAgent>`
   the preset. Confirm the editor rail looks unchanged.
6. **Phase 6 — settings view.**
   `ui/settings/*` panels + `ReAgentSettingsView` opened from the header (a
   tabbed page that replaces the chat, with a back button); remove the
   `/settings` Account Agent tab.
7. **Phase 7 — polish.**
   i18n keys, empty/error states, keyboard shortcuts, `agent.config` cleanup of
   legacy keys, docs/AGENTS update.

---

## 7. i18n

Add keys under the existing `agent` namespace in `admin_ui/src/lib/i18n.ts`
(en ~line 637, zh ~line 1380), e.g.:

- sessions: `sessionTreeTitle`, `sessionNew`, `sessionBranch`, `sessionBranchFromHere`,
  `sessionLoad`, `sessionRename`, `sessionDelete`, `sessionDeleteKeepChildren`,
  `sessionSearch`, `sessionEmpty`, `sessionActive`, `sessionMsgs`
- settings view: `settingsOpen`, `settingsTabModel`, `settingsTabPrompt`,
  `settingsTabSkills`, `settingsTabTools`, `settingsTabMcp`
- tools panel: `toolsBuiltin`, `toolsCustom`, `toolsDisabledHint`,
  `toolsGroup.content|editor|web|skills|mcp`
- skills: `skillsBuiltin`, `skillsCustom`, `skillsBuiltinBadge`

Keep `agent.title`, `agent.newChat`, etc. where semantics are unchanged.

---

## 8. Open questions

1. **Config storage.** This plan keeps `AgentConfig` in localStorage (small,
   synchronous) and only sessions in IndexedDB. If skills/prompts grow, move
   config into an IndexedDB `config` store.
2. **Package extraction.** Keep the component in `admin_ui` (shadcn = owned
   code) or extract `core/` into a workspace package so sifronts can embed an
   agent? Proposal: keep in `admin_ui` now; `core/` is import-clean for a later
   move.
3. **Built-in skill set.** Which starter skills ship? Proposal: `seo-review`,
   `markdown-style`, `alt-text`; content authored in `core/skill-registry.ts`.
4. **Delete semantics.** Reparent children (locked) vs. cascade delete with a
   confirm. Proposal: reparent; add cascade as a follow-up option.
5. **Concurrent sessions.** One active by definition; should a fork be allowed
   while the active session is streaming (auto-abort first)? Proposal: yes,
   abort, with a toast.
6. **Fork naming.** Auto-title a fork `` `<parent title> › branch` `` and let
   the user rename, or prompt for a name up front? Proposal: auto-title.

---

## 9. Risks

| Risk | Mitigation |
|------|-----------|
| Big-bang rewrite regresses editor flow | Phased; preset keeps `ReAgent` props; each phase independently shippable |
| IndexedDB v2 upgrade loses sessions | `onupgradeneeded` only adds fields; rows are backfilled in place; no store recreation |
| Config migration drops a key | Explicit legacy map (§3.3); leave legacy keys in place for one release |
| Part split duplicates logic | Phases 1–4 move state to `core/` first; UI parts in phase 5 are presentational only |
| Fork tree grows unbounded / confusing | Sessions view search + relative times; delete reparents; future auto-prune |
| `AgentMessage` has no id, fork anchors drift | Anchor by index/count, persisted as `forkFromIndex`; transcript is append-only |

---

## 10. Verification

- **No browser in this environment** (per `AGENTS.md`): rely on
  `cd admin_ui && pnpm run typecheck`, `cd ui_sdk && pnpm run format` when
  touched, `pnpm run format`, `php build.php`, and code inspection.
- Per phase: typecheck + build; phases touching persisted shape also exercise
  the CLI/curl path against `dist/index.php` (the agent runs client-side, so UI
  behavior is verified by inspection + your manual smoke test).
- Regression checklist (manual): composing a message; abort; model/thinking
  switch; selection clamp; attachments; new/load/fork/rename/delete session;
  settings view/panel edits reflected live in the composer; the sessions view
  loads/branches correctly; `/settings` Account has no Agent tab; editor rail
  unchanged.

---

## 11. Implementation deltas

Shipped, with these deviations from the plan above:

- **Headless modules live in `lib/agent/`, not `components/agent/core/`.**
  `lib/agent/` is already the lower layer; putting `config.ts`,
  `session-store.ts`, `tool-registry.ts` (folded into `tools.ts`) and
  `skill-registry.ts` there avoids `lib → components` imports from `mcp.ts` /
  `models.ts`. Only the React pieces (`reagent-provider.tsx`, `hooks.ts`) are
  under `components/agent/core/`.
- **Config is a global external store, not a provider prop.** `AgentConfig`
  lives in `lib/agent/config.ts` (localStorage `agent.config`) with a
  `useSyncExternalStore` subscription; `useReAgentConfig()` works outside a
  `<ReAgentProvider>` so the same panels render on `/settings` → Agent. There
  is no controlled `config` prop.
- **`ReAgentProvider` owns the runtime**, exposed through `useReAgent()` and
  granular hooks (`useReAgentSession`, `useReAgentSessions`,
  `useReAgentRegistry`, `useReAgentConfig`).
- **`agent-chat.tsx` is a deprecated re-export** of `ReAgent`; the old
  `store.ts` and `skills.ts` shims were removed. The four legacy settings cards
  were deleted; `/settings` → Agent now reuses `ui/settings/*` panels wrapped in
  `Card`s.
- **`<ReAgent>` takes a `surface` variant**: `glass` (default) or `solid`
  (near-white in light, near-dark in dark). `data-surface` is set on the root and
  an unlayered CSS rule flattens `glass-control-opaque` descendants, so the
  whole conversation becomes one flat plane. The editor passes
  `surface="solid"`.
- **Built-in tool metadata** is inferred from a probe build inside `defineTool`,
  so the id/label/description never drift from the tool.
- **`save.ts` / `session-store`** store the fork tree (`parentId`,
  `forkFromIndex`); IndexedDB is upgraded to v2 with a `by-parent` index, and
  delete reparents children in both the DB and in-memory state.
- Verified with `pnpm run typecheck`, `php build.php`, `php -l dist/index.php`,
  and a curl smoke test of `?p=sifpress/admin/login` (HTTP 200, `ReAgent`
  present in the bundle). No browser available, so UI behavior needs a manual
  pass.
