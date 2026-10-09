import { getUiLib, loadUiChunk } from '../lazy-chunks';

export type MermaidTheme = 'light' | 'dark';

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, chart: string): Promise<{ svg: string }>;
}

let currentTheme: MermaidTheme = 'light';
let idCounter = 0;
const rerenders = new Set<() => void>();

/**
 * Theme variables pinned on top of mermaid's `default` / `dark` themes so
 * text always pairs with the fill it sits on:
 *
 * - light: dark text over light fills. Mermaid's own defaults ship white text
 *   over the light gantt bars (`#bfc7ff`, `lightgrey`) — 1.5–2.9:1 — and a
 *   mid-blue critical bar; the bars are lightened and the on-bar text pinned
 *   dark, and pie slice labels go from 4.1:1 to 5.8:1.
 * - dark: near-white text (`#f8fafc` family) over the dark fills. The gantt's
 *   light on-bar text sat on a light-grey "done" bar and a medium-blue
 *   "active" bar (1.1–1.7:1); those bars are darkened instead.
 *
 * Everything else keeps mermaid's palette — only the text/fill pairings are
 * corrected. Overrides win because `Theme.calculate()` copies them again
 * *after* deriving its own colors.
 */
const THEME_VARIABLES: Record<MermaidTheme, Record<string, string>> = {
  light: {
    taskBkgColor: '#c9cdf2',
    critBkgColor: '#fecaca',
    taskTextLightColor: '#1f2937',
    pieSectionTextColor: '#111827',
  },
  dark: {
    textColor: '#e5e7eb',
    titleColor: '#f8fafc',
    primaryTextColor: '#f8fafc',
    secondaryTextColor: '#e2e8f0',
    tertiaryTextColor: '#cbd5e1',
    actorTextColor: '#f1f5f9',
    labelTextColor: '#f1f5f9',
    activeTaskBkgColor: '#1d4ed8',
    doneTaskBkgColor: '#475569',
    critBkgColor: '#b91c1c',
  },
};

export function nextDiagramId(): string {
  idCounter += 1;
  return `md-diagram-${idCounter}`;
}

function mermaidLib(): MermaidApi | null {
  return getUiLib<MermaidApi>('mermaid');
}

function initialize(mermaid: MermaidApi): void {
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    fontFamily: 'inherit',
    theme: currentTheme === 'dark' ? 'dark' : 'default',
    themeVariables: THEME_VARIABLES[currentTheme],
  });
}

export function setMermaidTheme(theme: MermaidTheme): void {
  if (theme === currentTheme) {
    return;
  }
  currentTheme = theme;

  const mermaid = mermaidLib();

  if (mermaid !== null) {
    initialize(mermaid);
  }

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
  await loadUiChunk('ui-sdk-mermaid.mjs', () => mermaidLib() !== null);

  const mermaid = mermaidLib();

  if (mermaid === null) {
    throw new Error('mermaid failed to load');
  }

  initialize(mermaid);
  const { svg } = await mermaid.render(id, chart);
  return svg;
}
