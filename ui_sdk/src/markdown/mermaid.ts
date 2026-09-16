import mermaid from 'mermaid';

export type MermaidTheme = 'light' | 'dark';

let currentTheme: MermaidTheme = 'light';
let idCounter = 0;
const rerenders = new Set<() => void>();

export function nextDiagramId(): string {
  idCounter += 1;
  return `md-diagram-${idCounter}`;
}

function initialize(): void {
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
  initialize();
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
  initialize();
  const { svg } = await mermaid.render(id, chart);
  return svg;
}
