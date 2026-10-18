import type { MountOptions, Mounted, RenderOptions, RenderResult } from 'pele';
import { getUiLib, loadUiChunk } from '../lazy-chunks';

/**
 * Diagram rendering, backed by Pele (`pele`), a fast Mermaid-to-SVG renderer.
 *
 * Pele colors (and fonts) come from CSS variables (`--pele-*`), so a diagram
 * is themed by the host stylesheet and recolors on a theme flip without being
 * re-rendered. The SVG is still produced as a string here so the markdown
 * post-processor and the editor node view can inject it the same way they did
 * with mermaid. `openDiagramLightbox` renders the same source into a zoomable
 * overlay on demand.
 */

export type MermaidTheme = 'light' | 'dark';

interface PeleApi {
  render(source: string, options?: RenderOptions): RenderResult;
  mount(element: HTMLElement, text: string, options?: MountOptions): Mounted;
}

let currentTheme: MermaidTheme = 'light';
let idCounter = 0;
const rerenders = new Set<() => void>();

export function nextDiagramId(): string {
  idCounter += 1;
  return `md-diagram-${idCounter}`;
}

function peleLib(): PeleApi | null {
  return getUiLib<PeleApi>('pele');
}

/**
 * The host font stack, so Pele measures and paints labels with the same font
 * as the surrounding prose. Every host theme defines `--font-sans`.
 */
function hostFontFamily(): string | undefined {
  if (typeof document === 'undefined') {
    return undefined;
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue('--font-sans').trim();

  return value === '' ? undefined : value;
}

/**
 * Notify the app of the resolved theme. Pele reads its palette from CSS at
 * paint time, so this only exists for hosts that render against stale metrics
 * (e.g. the editor node view).
 */
export function setMermaidTheme(theme: MermaidTheme): void {
  if (theme === currentTheme) {
    return;
  }

  currentTheme = theme;

  for (const rerender of rerenders) {
    rerender();
  }
}

export function registerDiagramRerender(fn: () => void): () => void {
  rerenders.add(fn);
  return () => {
    rerenders.delete(fn);
  };
}

export async function renderMermaidChart(chart: string, id: string): Promise<string> {
  await loadUiChunk('ui-sdk-pele.mjs', () => peleLib() !== null);

  const pele = peleLib();

  if (pele === null) {
    throw new Error('pele failed to load');
  }

  const fontFamily = hostFontFamily();
  const { svg } = pele.render(chart, {
    idPrefix: id,
    responsive: true,
    ...(fontFamily === undefined ? {} : { fontFamily }),
  });

  return svg;
}

let activeLightbox: (() => void) | null = null;

/**
 * Open a diagram in a full-screen, zoomable overlay. Uses Pele's `mount()` so
 * the diagram gets zoom controls (buttons, pinch/ctrl-wheel, drag, keyboard)
 * and re-lays out to the overlay width.
 */
export async function openDiagramLightbox(chart: string): Promise<void> {
  if (chart.trim() === '') {
    return;
  }

  await loadUiChunk('ui-sdk-pele.mjs', () => peleLib() !== null);

  const pele = peleLib();

  if (pele === null) {
    return;
  }

  // Only one overlay at a time.
  activeLightbox?.();

  const overlay = document.createElement('div');
  overlay.className = 'md-diagram-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  const backdrop = document.createElement('div');
  backdrop.className = 'md-diagram-lightbox-backdrop';

  const panel = document.createElement('div');
  panel.className = 'md-diagram-lightbox-panel';

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'md-diagram-lightbox-close';
  close.setAttribute('aria-label', 'Close diagram');
  close.textContent = '×';

  const stage = document.createElement('div');
  stage.className = 'md-diagram-lightbox-stage';

  panel.append(close, stage);
  overlay.append(backdrop, panel);
  document.body.appendChild(overlay);

  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  let mounted: Mounted | undefined;
  let closed = false;

  const closeLightbox = (): void => {
    if (closed) {
      return;
    }
    closed = true;
    document.removeEventListener('keydown', onKey);
    mounted?.destroy();
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    if (activeLightbox === closeLightbox) {
      activeLightbox = null;
    }
  };

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      closeLightbox();
    }
  }

  close.addEventListener('click', closeLightbox);
  backdrop.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', onKey);
  activeLightbox = closeLightbox;

  // Wait for layout so `mount()` can measure the stage width.
  requestAnimationFrame(() => {
    if (!closed) {
      mounted = pele.mount(stage, chart, { zoom: true, responsive: true });
    }
  });
}
