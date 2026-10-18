import type { RenderOptions, RenderResult } from 'pele';
import { getUiLib, loadUiChunk } from '../lazy-chunks';

/**
 * Diagram rendering, backed by Pele (`pele`), a fast Mermaid-to-SVG renderer.
 *
 * Pele colors (and fonts) come from CSS variables (`--pele-*`), so a diagram
 * is themed by the host stylesheet and recolors on a theme flip without being
 * re-rendered. The SVG is still produced as a string here so the markdown
 * post-processor and the editor node view can inject it the same way they did
 * with mermaid.
 */

export type MermaidTheme = 'light' | 'dark';

interface PeleApi {
  render(source: string, options?: RenderOptions): RenderResult;
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
