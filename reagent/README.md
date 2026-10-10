# @sifpress/reagent

Composable React AI agent: an in-app chat with a conversation tree and a
self-contained settings view, built on
[`@earendil-works/pi-agent-core`](https://www.npmjs.com/package/@earendil-works/pi-agent-core)
and `pi-ai`. The agent loop runs entirely in the browser; your keys and
conversations stay on the device.

## Install

```bash
pnpm add @sifpress/reagent @earendil-works/pi-agent-core @earendil-works/pi-ai
```

`react`, `react-dom` and the `@earendil-works/*` packages are peer
dependencies.

## Styles

In your Tailwind v4 entry (after `@import "tailwindcss"`):

```css
@import "@sifpress/reagent/styles.css";
@source "../node_modules/@sifpress/reagent/dist";
```

The `@source` line makes Tailwind generate the utilities the package uses.
Tokens (`--background`, `--card`, `--border`, `--muted-foreground`, `--primary`,
`--accent`, `--destructive`, `--ring`, …) are the theming contract; the package
ships low-specificity fallbacks.

## Usage

```tsx
import { ReAgent } from '@sifpress/reagent';

<ReAgent
  theme="dark"
  surface="glass"            // or "solid" (near-white / near-dark plane)
  renderMarkdown={MarkdownView}
  uploadFile={async file => {
    const asset = await upload(file);
    return `![${asset.name}](${asset.url})`;
  }}
  extraDescriptors={hostTools}   // domain tools shown in the Tools panel
  notify={(message, level) => toast[level ?? 'success'](message)}
  messages={overrides}           // partial copy overrides
/>
```

### Host integrations (all optional)

| Prop | Purpose | Default |
|------|---------|---------|
| `renderMarkdown` | Render assistant messages | plain `<pre>` |
| `extraDescriptors` | Domain tool descriptors (search, tags, …) | none |
| `extraTools` | Raw `AgentTool`s (e.g. MCP) | none |
| `uploadFile` | Persist a file the model can't read; return markdown | images only (vision) |
| `notify` | Success/error notifications | no-op |
| `messages` / `translate` | Copy overrides | English defaults |
| `theme` / `language` | Rendering theme + answer language | `light` / `en` |

### Headless

`ReAgentProvider` + the `ui/` parts + `useReAgent*` hooks let you build a
completely different arrangement. `useReAgentConfig()` reads the global
`AgentConfig` store and works outside the provider.
