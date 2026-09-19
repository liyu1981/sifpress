# Plan — sifpress1 background: canvas host + pluggable scene

Split the current `ambient-background.tsx` into a **generic canvas host** (React)
and a **pure scene module** so the background renderer can be swapped later
(e.g. from a KV config) without touching the React lifecycle code.

Current state: one file owns everything — canvas/DOM/RAF lifecycle *and* the
blob math, palette, and drawing. The blob math reads `window`/`document`
directly, so it can't be reused or replaced.

---

## 1. Goals / non-goals

**Goals**
- `background-with-canvas.tsx`: owns the canvas element, DPR, sizing, resize,
  RAF, reduced-motion/transparency, theme observation; calls a supplied scene.
- `ambient.ts`: pure scene class (blob palette + draw/update math), no DOM.
- The host passes the scene an **environment** (size, DPR, dark, reduced flags);
  the scene recalculates from it.
- Enable a future swap: a KV key selects a registered scene kind + config.

**Non-goals (this change)**
- No KV wiring yet (see §7 — it's the follow-up, and the reason for the split).
- No visual change: the ambient scene must render exactly as today.

**Decision — KV selects a registered scene, never code.** KV stores a `kind`
(and a data-only `config`), which the bundle maps to a shipped scene class.
Executing JavaScript loaded from KV was considered and **rejected** (§7.4): since
`kvs.write` is held by the *editor* role and the admin UI is same-origin, it would
let any editor run arbitrary JS in every visitor's browser.

---

## 2. Target files

```
sifronts/sifpress1/src/components/
  background-with-canvas.tsx   # NEW: React host + SceneEnv / CanvasScene contract
  ambient.ts                   # NEW: AmbientScene class + ambientScene singleton
  ambient-background.tsx       # DELETED (replaced by the two above)
```

`__root.tsx` switches its import (`AmbientBackground` → `BackgroundWithCanvas` +
`ambientScene`). Later, a small `background/registry.ts` maps a KV `kind` to a
scene factory; it is intentionally **not** part of this split.

---

## 3. Contract (in `background-with-canvas.tsx`)

The host is scene-agnostic; a scene is any object implementing this interface.

```ts
export interface SceneEnv {
  /** Canvas CSS size in px (ctx transform already applies `dpr`). */
  width: number;
  height: number;
  /** devicePixelRatio actually used (capped, e.g. ≤ 2). */
  dpr: number;
  dark: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
}

export interface CanvasScene {
  /** Reconfigure from the latest env: mount, resize, theme, media change. */
  update(env: SceneEnv): void;
  /** Draw one frame. `time` is seconds since the animation origin. */
  draw(ctx: CanvasRenderingContext2D, time: number): void;
  /** Optional teardown on unmount. */
  destroy?(): void;
}
```

Notes
- `update` is called for **every** env change; the scene diffs internally (e.g.
  rebuild blobs only when `dark`/`reducedTransparency` changes). Calling it every
  frame is avoided by the host.
- `draw` receives an already-scaled context, so the scene works in CSS px.
- No `window`/`document` in the contract — swapping scenes can't leak DOM.

---

## 4. `background-with-canvas.tsx`

```tsx
export interface BackgroundWithCanvasProps {
  scene: CanvasScene;
  className?: string;   // appended to the fixed full-viewport defaults
  maxDpr?: number;      // default 2
}

export function BackgroundWithCanvas({ scene, className, maxDpr = 2 }: BackgroundWithCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const transparency = window.matchMedia('(prefers-reduced-transparency: reduce)');
    let raf = 0;
    let disposed = false;

    const readEnv = (): SceneEnv => ({
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: Math.min(window.devicePixelRatio || 1, maxDpr),
      dark: document.documentElement.classList.contains('dark'),
      reducedMotion: motion.matches,
      reducedTransparency: transparency.matches,
    });

    let env: SceneEnv = readEnv();

    const applySize = () => {
      canvas.width = Math.round(env.width * env.dpr);
      canvas.height = Math.round(env.height * env.dpr);
      canvas.style.width = `${env.width}px`;
      canvas.style.height = `${env.height}px`;
      ctx.setTransform(env.dpr, 0, 0, env.dpr, 0, 0);
    };

    const refresh = () => {
      env = readEnv();
      applySize();
      scene.update(env);
      scene.draw(ctx, performance.now() / 1000); // immediate paint (reduced-motion safe)
    };

    const frame = (t: number) => {
      scene.draw(ctx, t / 1000);
      if (!disposed && !env.reducedMotion) raf = requestAnimationFrame(frame);
    };

    const themeObserver = new MutationObserver(refresh);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('resize', refresh);
    motion.addEventListener('change', refresh);
    transparency.addEventListener('change', refresh);

    refresh();
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      themeObserver.disconnect();
      window.removeEventListener('resize', refresh);
      motion.removeEventListener('change', refresh);
      transparency.removeEventListener('change', refresh);
      scene.destroy?.();
    };
  }, [scene, maxDpr]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={cn('pointer-events-none fixed inset-0 z-0', className)}
    />
  );
}
```

Behaviour parity with today
- Inline style `width/height` + backing-store scale via `setTransform` (same).
- `MutationObserver` on `documentElement` class → theme change.
- `matchMedia` for reduced motion (draw one frame, no loop) and reduced
  transparency (passed to the scene).
- `dpr` capped at `maxDpr` (default 2); recomputed on resize so moving the window
  across monitors picks up a new DPR.

`scene` is an effect dependency, so swapping the instance re-initializes cleanly
(needed once KV can select a scene).

---

## 5. `ambient.ts`

Move the existing constants + math verbatim (`HUES`, `LIGHT`, `DARK`, `Blob`,
`clamp`, `paletteFor`, `makeBlobs`, `wrap`) and expose a scene.

```ts
import type { CanvasScene, SceneEnv } from '@/components/background-with-canvas';

export class AmbientScene implements CanvasScene {
  #env: SceneEnv | null = null;
  #blobs: Blob[] = [];
  #signature = '';

  update(env: SceneEnv): void {
    this.#env = env;
    const signature = `${env.dark}:${env.reducedTransparency}`; // + palette config later
    if (signature !== this.#signature) {
      this.#signature = signature;
      this.#blobs = makeBlobs(paletteFor(env.dark, env.reducedTransparency));
    }
  }

  draw(ctx: CanvasRenderingContext2D, time: number): void {
    const env = this.#env;
    if (!env) return;
    ctx.clearRect(0, 0, env.width, env.height);
    ctx.globalCompositeOperation = 'lighter';
    const base = Math.min(env.width, env.height);
    for (const blob of this.#blobs) {
      // width/height/base now come from `env` instead of component-local vars
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

/** The default scene wired up by RootLayout today. */
export const ambientScene = new AmbientScene();
```

Because the only inputs are `env` + the palette constants, the scene is
unit-testable and reusable. `draw` and `update` are exactly the two "drawing /
updating functions" the host drives.

---

## 6. Wiring

`__root.tsx`:

```tsx
import { BackgroundWithCanvas } from '@/components/background-with-canvas';
import { ambientScene } from '@/components/ambient';
// …
<BackgroundWithCanvas scene={ambientScene} />
```

Same canvas position/stacking (`fixed inset-0 z-0`, `pointer-events-none`), so
layout is unchanged.

---

## 7. Future: swap the scene from KV

This split exists so the renderer can be selected at runtime. Follow-up (not this
change). **KV only ever selects a registered id and supplies data — never code**
(§7.4):

1. `meta.json` + `ThemeConfig` (`lib/theme-config.tsx`) gain
   `sifpress1.background.kind` (string, default `"ambient"`) and
   `sifpress1.background.config` (JSON). This slots into the existing
   `kvs.batchGet` theme hydration from `plan/sifront-theme-kv-config.md`
   (which already reserves `sifpress1.ambient.palette`).
2. `lib/background/registry.ts`:
   ```ts
   const SCENES: Record<string, (config: unknown) => CanvasScene> = {
     ambient: config => new AmbientScene(parsePalette(config)),
     none: () => new EmptyScene(),
   };
   export function createScene(kind: string, config: unknown): CanvasScene {
     return (SCENES[kind] ?? SCENES.ambient)(config);
   }
   ```
3. `RootLayout` resolves the scene once (`useMemo` on kind/config) and passes it
   to `<BackgroundWithCanvas scene={scene} />`.
4. `AmbientScene` gains an optional palette config (sat/light/alpha/count/hues,
   clamped) so `sifpress1.ambient.palette` drives it — matching the KV plan.

### 7.4 Why not load scene *code* from KV (rejected)

Storing JS source in KV and executing it (`new Function`, blob `import()`, or a
backend JS endpoint) is technically feasible — no CSP is set today and KV allows
1 MB — but it is **remote code execution by design**:

- `kvs.write` belongs to the **editor** role (`src/db.php`), so any editor could
  run arbitrary JS for every public visitor — an escalation from content edit to
  site-wide XSS. Since the admin UI is same-origin, an admin browsing the public
  sifront with an active session would have that code run against their session.
- It forces `'unsafe-eval'` / `script-src blob:` if a CSP is ever added, blocking
  hardening.
- No isolation, no build-time validation, no integrity; a throw breaks the page
  unless every call is wrapped.

If arbitrary logic is ever needed, it must be a **declarative** scene shipped in
the bundle and parameterized by KV data (palette, blob counts/sizes, gradient
stops, an optional image URL) — not evaluated source.

---

## 8. Steps

1. Add `background-with-canvas.tsx` (§3 contract + §4 host).
2. Add `ambient.ts` (§5), moving the blob code unchanged; replace component-local
   `width`/`height` with `env`.
3. Update `__root.tsx` to use the new pair; delete `ambient-background.tsx`.
4. `pnpm run format` + `pnpm run typecheck` in `sifronts/sifpress1`.
5. `php buildfront.php`; spot-check the bundle contains the canvas + the
   `ambientScene` singleton.
6. (Follow-up PR) KV keys + registry (§7).

## 9. Risks / notes

- **StrictMode double-mount**: the effect cleanup fully cancels RAF/observers;
  `update` is idempotent, and the singleton has no `destroy` state to corrupt.
- **DPR changes** (multi-monitor): `readEnv` recomputes `dpr` on resize.
- **No SSR**: sifront is a client SPA, but `window`/`document` access stays inside
  `useEffect` regardless.
- **Reduced motion**: a single `draw` on `refresh` plus a one-shot `frame`.
- **Multiple canvases**: the singleton is fine for one host; if more are ever
  mounted, switch the prop to a factory (`createScene`) so each host gets its own
  instance.
- **No code from KV**: scenes are always classes in the bundle; KV supplies a
  registered `kind` + data only (§7.4).

## 10. Verification

- `pnpm run typecheck` and `pnpm run format` clean in `sifronts/sifpress1`.
- `php buildfront.php` succeeds; the bundle no longer references
  `ambient-background.tsx` and contains `BackgroundWithCanvas`/`ambientScene`.
- Visual parity: same blob count/palette/alpha/motion; theme toggle rebuilds
  blobs; `prefers-reduced-transparency` lowers alpha; `prefers-reduced-motion`
  draws a static frame. (No browser in this environment — verify via
  typecheck/build + code inspection, per `AGENTS.md`.)
