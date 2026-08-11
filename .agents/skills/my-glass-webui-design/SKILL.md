---
name: my-glass-webui-design
description: The liquid-glass (Apple-style frosted material) design system practice used in the mindx project. Use when creating or reviewing glass/frosted surfaces — backdrop-filter blur, translucent panels, glass buttons, frosted dropdowns/dialogs/sheets, ambient gradient backgrounds, material shadows, or dark-mode glass — in Tailwind CSS v4 / Next.js. Covers the glass-control / apple-panel / ambient-bg class system, why each CSS detail exists, and the composition rules for applying it.
---

# Glass Web UI Design (mindx practice)

The distilled, working practice from the mindx codebase (`src/app/globals.css`,
`src/components/ui/*`). A glass interface only looks good when the frosted
surface has **something colorful to blur** and the material is built from the
app's **theme tokens**, not hardcoded colors.

The whole system lives in `@layer components` in `globals.css`. It is built on:

- **CSS custom properties** (`--background`, `--border`, `--primary`, `--ring`,
  …) defined in `:root` and `.dark`, exposed to Tailwind via `@theme inline`.
- **`color-mix(in oklch, <var>, transparent)`** for every translucent value —
  never hand-picked `rgba()`. This is what makes light/dark just work.
- **Three reusable classes**: `glass-control` (surfaces), `apple-panel`
  (chrome/headers), `ambient-bg` (the backdrop color they blur).

## 1. The core surface: `glass-control`

Single source of truth for every frosted control — buttons, cards, dropdowns,
dialogs, sheets, chat bubbles, toolbars, search boxes. **Never copy these
declarations into a screen**; apply the class name.

```css
.glass-control {
  background: linear-gradient(
    180deg,
    color-mix(in oklch, var(--background) 45%, transparent),
    color-mix(in oklch, var(--background) 14%, transparent)
  );
  border: 1px solid color-mix(in oklch, var(--border), transparent 45%);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  box-shadow:
    0 8px 32px rgb(0 0 0 / 0.12),
    inset 0 1px 0 color-mix(in oklch, white 28%, transparent);
}
```

Every detail earns its place:

| Detail | Why it exists |
| --- | --- |
| Vertical background gradient (`45% → 14%`) | A flat fill reads as paper; a gradient reads as a *sheet of material* catching light. |
| `color-mix(in oklch, var(--background) …)` | Derives translucency from the theme token, so light/dark are automatic and never drift. |
| 1px **translucent** border (`--border` @ 45%) | A solid border on glass looks cheap; a faded one reads as the material's edge. |
| `blur(24px) saturate(180%)` | The blur is what makes it glass; `saturate` boosts whatever color sits behind so it doesn't wash out to gray. |
| Outer shadow `0 8px 32px` | Separates the surface from the page (depth hierarchy). |
| Inset highlight `inset 0 1px 0 white 28%` | Light catching the top edge — the signature "glass lip." |

### Dark mode is a separate spec, not a brightness flip

```css
.dark .glass-control {
  background: linear-gradient(
    180deg,
    color-mix(in oklch, white 16%, transparent),
    color-mix(in oklch, white 5%, transparent)
  );
  border-color: color-mix(in oklch, white 18%, transparent);
  box-shadow:
    0 8px 32px rgb(0 0 0 / 0.45),
    inset 0 1px 0 color-mix(in oklch, white 14%, transparent);
}
```

In dark mode the surface is built from **white-based translucency** (16% → 5%),
not from `--background` (which is itself dark). A `color-mix` of a dark token
onto a dark page disappears; white-based glass is what actually reads as frosted
over a dark backdrop. The shadow deepens (`.45` alpha) and the inset highlight
dims (`white 14%`) because there is less light.

## 2. Supporting surfaces

- **`apple-panel`** — blurred sticky headers/panels. Gradient `68% → 34%` of
  `--background`, same `blur(24px) saturate(180%)`, inset top highlight.
  Dark variant again white-based (`white 20% → 7%`, inset `white 12%`).
  Used on: project browser header, LLM page header, editor header.
- **`apple-panel-dark`** — heavier chrome: `--background` at 25% transparency
  with a stronger `blur(30px) saturate(200%)`. **Bigger surfaces read as
  thicker** → stronger blur + deeper shadow.
- **`apple-scrim`** — gradient `transparent → var(--background)` bottom fade
  for content scrolling under floating chrome (scroll edge effect, not a hard
  divider).
- **`ambient-bg`** — page-level background of radial glows in `--primary` and
  `--ring` (light: 7–9% alpha; dark: 14–20%). **This is what the glass blurs.**
  Frosted surfaces over a flat background look like gray plastic; over ambient
  color they look like real frosted glass. Every screen that uses glass
  surfaces must sit on `ambient-bg`.

```css
.ambient-bg {
  background-color: var(--background);
  background-image:
    radial-gradient(130% 110% at 6% -12%, color-mix(in oklch, var(--primary) 9%, transparent) 0%, transparent 55%),
    radial-gradient(90% 70% at 100% 0%,    color-mix(in oklch, var(--ring) 8%, transparent) 0%, transparent 50%),
    radial-gradient(130% 90% at 50% 125%,  color-mix(in oklch, var(--primary) 7%, transparent) 0%, transparent 60%);
}
```

## 3. Composition rules (how to apply it)

1. **Overlays get `glass-control` from the shared UI component**, never inline.
   `ui/dialog.tsx`, `ui/sheet.tsx`, `ui/dropdown-menu.tsx` all apply
   `glass-control` on their `Content`/`Popup` wrapper — screens just use
   `<DialogContent />` and inherit the glass.
2. **Buttons use the `glass` variant** (`ui/button.tsx`): composes
   `glass-control !border-border/60` plus brightness feedback on interaction —
   `hover:brightness-[1.06]`, `active:brightness-95`,
   `aria-expanded:brightness-110`. Brightness (not a color change) keeps the
   material consistent while adding affordance.
3. **Interactive surfaces get physicality**: cards/dropzones/new-project
   buttons combine `glass-control` with `hover:brightness-[1.04]
   hover:-translate-y-px active:scale-[0.98]`.
4. **Add `bg-clip-padding`** on buttons/sheets so the translucent border doesn't
   bleed into children.
5. **Scrims stay light because the glass is translucent**: dialog overlay is
   `bg-black/45 + backdrop-blur-md`, sheet overlay `bg-black/60 +
   backdrop-blur-sm`. Since `glass-control` is translucent, a heavy scrim would
   darken the dialog itself — keep overlays airy.
6. **Text on glass** uses `text-popover-foreground` / `text-muted-foreground`
   (vibrancy: slightly higher contrast and heavier weight than flat-gray over
   busy backgrounds).
7. **Materialize, don't just fade**: overlays enter with `data-open:animate-in
   data-open:fade-in-0 data-open:zoom-in-95` (+ a directional slide) and exit
   mirrored — the surface reads as a real sheet arriving, not a ghost.
8. **Standard screen skeleton**: `div.h-screen.ambient-bg` →
   `header.apple-panel` (sticky) → content, with `apple-scrim` at the bottom of
   scrolling chrome. Editor header, project browser, and LLM page all share it.
9. **Reduced motion**: `@media (prefers-reduced-motion: reduce)` collapses all
   animation/transition durations and strips animate-in classes from
   `dialog-content`, `sheet-content`, `dropdown-menu-content` (see globals.css
   end). Never ship glass motion without this guard.

## 4. Pitfalls (what not to do)

- **Hardcoded `rgba(255 255 255 / .x)` surfaces** — they ignore the theme and
  break dark mode. Always `color-mix(in oklch, var(--...) , transparent)`.
- **Copying the glass CSS into individual screens** — one source of truth in
  `globals.css`; screens only list the class.
- **Solid borders** on glass — use `color-mix(..., transparent 45%)`.
- **Dark mode by inverting the light spec** — write the separate white-based
  `.dark` block.
- **Flat backgrounds** under glass — without `ambient-bg` (or similar color
  behind), blur has nothing to show and the surface looks gray.
- **Blur + scroll jank**: `backdrop-filter` is expensive — apply it to few,
  large surfaces, not to every child element inside a glass panel.

## 5. Reference: real usages

- Surface: `glass-control` on `ProjectCard`, `OpenDropzone`, chat bubbles,
  `AiAssistantFloating`, `NodeSearch`, `FloatingToolbar`, dialog/sheet/dropdown
  content.
- Chrome: `apple-panel` on all three sticky headers; `apple-panel-dark` for
  heavier panels.
- Backdrop: `ambient-bg` on project browser + LLM page (glass over it).
- Button variant: `variant="glass"` in `src/components/ui/button.tsx`.
- Standalone viewer (HTML export) uses a **simplified** offline spec
  (`viewer/src/viewer.css`, `blur(14px)`, no Tailwind) — don't copy the Next.js
  glass classes there; keep the two in sync by intent, not by string-matching.
