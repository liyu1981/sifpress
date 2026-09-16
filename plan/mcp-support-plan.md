# mcp-support-plan.md — MCP server support for the in-app AI assistant

Scope: let the in-editor AI assistant (browser-side Pi agent) call **MCP
servers** over Streamable HTTP — starting with Exa's remote server
`https://mcp.exa.ai/mcp` — by discovering their tools and exposing them to the
model as regular `AgentTool`s.

Related: `plan/pi-web-agent-plan.md` (the agent), `admin_ui/src/lib/agent/`.

---

## 1. Goals

1. Connect to one or more remote MCP servers (Streamable HTTP) from the browser.
2. Discover their tools (`tools/list`) and expose them to the agent with no
   changes to the LLM layer.
3. Let the user manage servers (URL, optional API key, enable/disable, test) in
   Agent settings; persist locally like the existing provider keys.
4. Ship with a working **Exa** preset (`web_search_exa`, `web_fetch_exa`).
5. Keep it local-first: config + keys on the device, browser↔server direct.

Non-goals for v1: MCP **resources**, **prompts**, sampling/elicitation, stdio
servers, OAuth, and server-side proxying.

---

## 2. Research findings (verified on this machine)

**Exa's server** — probed live with `curl`:

- `POST https://mcp.exa.ai/mcp` completes `initialize` with protocol
  `2025-06-18`; `serverInfo.name = "exa-search-server"`, capabilities
  `tools/prompts/resources` (all `listChanged: true`).
- **CORS is open**: `access-control-allow-origin: *`,
  `access-control-allow-methods: GET, POST, DELETE, OPTIONS`,
  `access-control-allow-headers: … Authorization, x-api-key, Mcp-Session-Id …`,
  `access-control-expose-headers: Mcp-Session-Id`. → **a browser can call it
  directly; no backend proxy required.**
- Responses use `content-type: text/event-stream` (SSE `event: message` +
  `data: {…}`), and the server returns an `mcp-session-id` header.
- `tools/list` currently returns **2 tools**:
  - `web_search_exa` — required `query`, `objective`; optional `numResults`.
  - `web_fetch_exa` — required `urls`; optional `maxCharacters`.
- `tools/call` works **without an API key** (anonymous, rate-limited); an
  `exaApiKey` query param raises limits / unlocks the full tool set.

**SDK available in-tree** — `@modelcontextprotocol/sdk@1.30.0` is already
installed transitively (pi-ai / pi-agent-core / @google/genai):

- `Client` (`…/sdk/client/index.js`): `connect(transport)`, `listTools()`,
  `callTool(params, schema?, options?)`, `setNotificationHandler(...)`,
  `close()`, `getServerCapabilities()`, `getInstructions()`.
- `StreamableHTTPClientTransport` (`…/sdk/client/streamableHttp.js`):
  `new StreamableHTTPClientTransport(new URL(url), { requestInit?, authProvider? })`.
  Imports only `fetch`, `eventsource-parser/stream`, and shared helpers —
  **no `node:` imports on the client path** (`stdio.js` is the only Node one).
- The client bundles `AjvJsonSchemaValidator` (`ajv` is already a direct dep of
  `admin_ui`, used by the JSON editor).
- `callTool` accepts `RequestOptions` including `signal` (cancellation) and
  `onprogress`.

**Pi agent is schema-flexible** — `AgentTool<TParameters extends TSchema>`
extends pi-ai's `Tool<TParameters> = { name, description, parameters: TSchema }`.
Pi validates args with `Compile()`/`Value` from `typebox`, and **pi-ai itself
uses `Type.Unsafe({...})`** (`dist/utils/typebox-helpers.js`), so an MCP tool's
JSON-Schema `inputSchema` can be wrapped with `Type.Unsafe` and used as-is.

**Pi supports re-labelling tools and the toolset is mutable** — `Agent.state`
has a `set tools(...)`; the loop reads the tool array at run start. There is
also `AgentToolResult.addedToolNames`, but there is no automatic registry, so
the host owns the tool list.

---

## 3. Architecture

```
AgentChat (admin_ui/src/components/agent/agent-chat.tsx)
   │  connects enabled servers before/around building the agent
   ▼
McpManager (singleton)            admin_ui/src/lib/agent/mcp/manager.ts
   ├─ McpServerConnection[]       Client + StreamableHTTPClientTransport
   │     └─ tools()               listTools → cached descriptors
   └─ toolChanged subscription    notifications/tools/list_changed
   ▼
mcpToolToAgentTool(server, tool)  admin_ui/src/lib/agent/mcp/adapter.ts
   ▼
AgentTool[]  ── merged with buildAgentTools(editor) ──► Agent.state.tools
```

- MCP is **admin-only** (the sifront has no agent).
- One `Client` + transport per configured server, connected lazily when the
  server is enabled and the agent session starts.
- Tool names are namespaced: `mcp__<serverId>__<toolName>` (sanitized to
  `[A-Za-z0-9_-]`, ≤64 chars, OpenAI-compatible).

---

## 4. Tool adapter

`admin_ui/src/lib/agent/mcp/adapter.ts`:

```ts
import { Type, type TSchema } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

export function mcpToolToAgentTool(
  server: { id: string; name: string },
  client: Client,
  tool: Tool,
): AgentTool<any> {
  const name = mcpToolName(server.id, tool.name);
  return {
    name,
    label: tool.annotations?.title ?? `${server.name}: ${tool.name.replace(/_/g, ' ')}`,
    description: `${tool.description ?? ''}\n\n(Provided by MCP server "${server.name}".)`.trim(),
    // MCP inputSchema is JSON Schema; TypeBox schemas *are* JSON Schema and
    // pi-ai's validator compiles them. `Unsafe` brands it as a TSchema.
    parameters: Type.Unsafe<TSchema>(tool.inputSchema as TSchema),
    execute: async (_id, args, signal) => {
      const result = await client.callTool(
        { name: tool.name, arguments: args as Record<string, unknown> },
        undefined,
        signal ? { signal } : undefined,
      );
      const text = (result.content ?? [])
        .map(c => (c.type === 'text' ? c.text : c.type === 'image' ? '[image]' : '[resource]'))
        .join('\n');
      if (result.isError) {
        throw new Error(text || `MCP tool ${tool.name} failed`);
      }
      return { content: [{ type: 'text', text }], details: result };
    },
  };
}
```

Notes:
- Images from MCP (`type: 'image'`, base64) could be forwarded as pi-ai
  `ImageContent` in a later phase; v1 maps non-text parts to a placeholder.
- Errors are thrown (pi convention) so the agent sees a failed tool call.
- `annotations.destructiveHint` is the hook for a confirmation gate in Phase 3.

---

## 5. Connection lifecycle

`McpManager`:

- `connect(serverConfig)` → create `Client({ name: 'sifpress', version })` +
  `StreamableHTTPClientTransport`, `await client.connect(transport)`, then
  `client.listTools()`.
- API key: append `?exaApiKey=…` to the URL (Exa's documented mechanism); the
  transport's `requestInit.headers` can carry `Authorization`/`x-api-key` if a
  server prefers headers.
- `onNotification(ToolListChangedNotificationSchema)` → re-`listTools()` and
  emit a `tools-changed` event; AgentChat then updates `agent.state.tools`
  (takes effect on the next turn — fine, the tool was just added).
- Reconnect/backoff: the transport already implements reconnection options;
  surface failures in the UI rather than silently retrying forever.
- `close()` on session switch / unmount (transport `close()` sends `DELETE`
  and drops the `Mcp-Session-Id`).

**Merging into the agent** — extend `buildAgent` with an `extraTools?` option:

```ts
tools: [...buildAgentTools(options.editor), ...(options.extraTools ?? [])],
```

`AgentChat.buildForSession` connects enabled servers (with a short timeout),
builds the agent with their tools, and stores the label map for the tool chips.
If a server is slow, the agent can start with base tools and the MCP tools get
added when the connection resolves (`agent.state.tools = [...]`).

---

## 6. Config & persistence

`admin_ui/src/lib/agent/mcp/config.ts` — localStorage, mirroring
`LocalCredentialStore` in `models.ts`:

```ts
const KEY = 'agent.mcp.servers';
export interface McpServerConfig {
  id: string;            // slug, used in tool names
  name: string;          // display name
  url: string;           // https://mcp.exa.ai/mcp
  enabled: boolean;
  apiKey?: string;       // optional; stored locally only
}
```

- Default preset: Exa (`id: 'exa'`, name "Exa", url `https://mcp.exa.ai/mcp`,
  disabled until the user enables/test it, matching the provider UX).
- Keys stay on the device. Caveat to document: when passed as a query param the
  key can appear in the server's access logs / browser devtools; header auth is
  preferred where the server supports it.

---

## 7. UI

**Agent settings** (`agent-settings.tsx`) — new "MCP servers" card
(`components/agent/mcp-settings.tsx`):

- Rows: name, URL, enable switch, status dot, "Test" (connect + `listTools`,
  show "N tools"), delete. Inline API-key field per server.
- "Add server" form; "Add Exa preset" shortcut.
- Test result reuses the existing per-provider status pattern.

**Chat** (`agent-chat.tsx`):

- Build `toolLabels` from the **active** tool list (base + MCP), not just
  `buildAgentTools()`.
- Tool chips already render `tool_execution_start/end`; MCP results are text,
  so they display as-is. Optionally render an MCP badge on chips.
- Surface connection errors as a non-blocking notice in the panel.

**i18n** (`lib/i18n.ts`): `agent.mcpTitle`, `agent.mcpDescription`,
`agent.mcpAdd`, `agent.mcpExaPreset`, `agent.mcpUrl`, `agent.mcpApiKey`,
`agent.mcpEnabled`, `agent.mcpTest`, `agent.mcpTools`, `agent.mcpConnectError`,
… (en + zh).

---

## 8. Security & privacy

- Tools run in the browser and call the remote server directly; the server sees
  the user's IP and queries. Document this in the settings description.
- Tool outputs are untrusted input → same prompt-injection exposure as
  `fetch_url` already has; keep tool results out of privileged actions.
- Read-only vs destructive: gate `annotations.destructiveHint` tools behind a
  confirmation in Phase 3.
- No secrets in the bundle; MCP keys live in localStorage exactly like the LLM
  provider keys.

### Fallback: backend proxy (only if needed)

If a chosen server lacks CORS, add `?p=sifpress/mcp` in `src/` that forwards
JSON-RPC and streams SSE, optionally injecting a key from `sifpress_config.php`.
**Not required for Exa** (CORS `*`), so defer indefinitely.

---

## 9. Dependencies & bundle

- Add `@modelcontextprotocol/sdk@1.30.0` (exact, to match the transitive
  version and avoid two copies) to `admin_ui/package.json`.
- `zod@^4` and `ajv` are already present. `eventsource-parser` comes via the
  SDK.
- The SDK client + `ajv` add some KB to the inlined admin bundle; `ajv` is
  already bundled for the JSON editor, so the marginal cost is the MCP
  client/transport.

---

## 10. Testing

- **Unit** (no browser): the adapter — name sanitization/nesting, `Type.Unsafe`
  wrapping, `content`→text mapping, `isError` throwing — against a fake
  `Client`.
- **Integration** (dev-only script, like the `curl` probes): connect to Exa,
  `listTools()`, call `web_search_exa`, assert text is returned.
- **Typecheck/format/build**: `pnpm run typecheck`, `pnpm run format`,
  `php build.php`. No browser verification per `AGENTS.md`.

---

## 11. Phased plan

**Phase 1 — connect + tools (Exa preset, minimal UI)**
- [ ] `mcp/adapter.ts`, `mcp/manager.ts`, `mcp/config.ts`.
- [ ] `buildAgent` `extraTools`; AgentChat connects enabled servers and merges.
- [ ] Tool labels from the active tool list.
- [ ] Hardcoded Exa preset; verify `web_search_exa` end-to-end in the chat.

**Phase 2 — settings + persistence**
- [ ] `components/agent/mcp-settings.tsx`; add/remove/enable, API key, Test.
- [ ] localStorage config; i18n keys (en + zh).
- [ ] Connection status + error surfacing.

**Phase 3 — robustness**
- [ ] `tools/list_changed` refresh; reconnect/backoff; `close()` on teardown.
- [ ] Destructive-tool confirmation via annotations.
- [ ] Optional: MCP resources/prompts, image content, per-server tool allowlist.

---

## 12. Decisions (locked)

1. **Exa is auto-enabled** on first run (default config, no explicit opt-in).
2. **API key** is stored in localStorage and managed in the Agent settings tab.
   With no key, requests are made anonymously.
3. **On rejection**, the failed tool call opens a dialog prompting for the Exa
   API key (the same key is also editable in settings).
4. **Tool names** are namespaced: `mcp__exa__web_search_exa` (≤ 64 chars).

## 13. Status

Implemented:

- `admin_ui/src/lib/agent/mcp.ts` — config + `McpManager` + MCP→`AgentTool`
  adapter: Streamable HTTP connect, `tools/list`, `tools/call`, `list_changed`
  refresh, Exa `exaApiKey` injection, auth/rate-limit detection.
- `buildAgent({ extraTools })`; AgentChat syncs enabled servers before building
  a session and keeps `agent.state.tools` in sync with the server's tool list.
- `admin_ui/src/components/agent/mcp-settings.tsx` — Exa card (enable toggle,
  API key, reconnect/test, status + tool count), mounted in the Agent settings
  tab (`pages/settings.tsx`).
- Chat key-prompt dialog (`components/agent/agent-chat.tsx`) + i18n (en/zh).
- Dependency: `@modelcontextprotocol/sdk@1.30.0` (exact, matching the
  transitive copy).

Verified: typecheck/format clean, Vite bundles the SDK for the browser (no new
Node externals), and the SDK was exercised against live Exa (`tools/list` +
`web_search_exa` call).

Deferred: MCP resources/prompts, image content, destructive-tool confirmation,
add/remove custom servers UI, reconnect backoff tuning.
