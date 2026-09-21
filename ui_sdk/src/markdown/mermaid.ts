import { getUiLib, loadUiChunk } from '../lazy-chunks';

export type MermaidTheme = 'light' | 'dark';

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  render(id: string, chart: string): Promise<{ svg: string }>;
}

let currentTheme: MermaidTheme = 'light';
let idCounter = 0;
const rerenders = new Set<() => void>();

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
