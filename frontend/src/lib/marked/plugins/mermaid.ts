import { InputRule } from '@milkdown/kit/prose/inputrules';
import type { Node } from '@milkdown/kit/prose/model';
import type { EditorView } from '@milkdown/kit/prose/view';
import { $inputRule, $nodeSchema, $remark, $view } from '@milkdown/kit/utils';
import type { Root } from 'mdast';
import { visit } from 'unist-util-visit';
import { nextDiagramId, registerDiagramRerender, renderMermaidChart } from '../mermaid';

const id = 'diagram';

const remarkMermaid = () => (tree: unknown) => {
  visit(tree as Root, 'code', (node, index, parent) => {
    if (node.lang === 'mermaid' && parent !== undefined && index !== null && index !== undefined) {
      parent.children.splice(index, 1, { type: id, value: node.value } as never);
    }
  });
};

export const remarkMermaidPlugin = $remark('remarkMermaid', () => remarkMermaid);

export const diagramSchema = $nodeSchema(id, () => ({
  content: 'text*',
  group: 'block',
  marks: '',
  defining: true,
  atom: true,
  isolating: true,
  attrs: {
    value: { default: '' },
    identity: { default: '' },
  },
  parseDOM: [
    {
      tag: `div[data-type="${id}"]`,
      preserveWhitespace: 'full',
      getAttrs: dom => ({
        value: dom.getAttribute('data-value') ?? '',
        identity: dom.getAttribute('data-id') ?? '',
      }),
    },
  ],
  toDOM: node => {
    const div = document.createElement('div');
    div.dataset.type = id;
    div.dataset.value = node.attrs.value ?? '';
    div.dataset.id = node.attrs.identity ?? '';
    div.textContent = node.attrs.value ?? '';
    return div;
  },
  parseMarkdown: {
    match: node => node.type === id,
    runner: (state, node, type) => {
      state.addNode(type, {
        value: node.value ?? '',
        identity: nextDiagramId(),
      });
    },
  },
  toMarkdown: {
    match: node => node.type.name === id,
    runner: (state, node) => {
      state.addNode('code', undefined, node.attrs.value ?? '', {
        lang: 'mermaid',
      });
    },
  },
}));

function createDiagramView(node: Node, view: EditorView, getPos: () => number | undefined) {
  const root = document.createElement('div');
  root.className = 'milkdown-diagram';

  const body = document.createElement('div');
  body.className = 'milkdown-diagram-body';
  root.appendChild(body);

  let chart = (node.attrs.value as string) ?? '';
  let cancelled = false;

  const renderSvg = (): void => {
    body.textContent = '';
    const loading = document.createElement('div');
    loading.className = 'milkdown-diagram-loading';
    loading.textContent = 'Loading diagram…';
    body.appendChild(loading);

    const renderId = (node.attrs.identity as string) || nextDiagramId();
    renderMermaidChart(chart, renderId)
      .then(svg => {
        if (!cancelled) {
          body.innerHTML = svg;
        }
      })
      .catch(() => {
        if (!cancelled) {
          renderError();
        }
      });
  };

  const renderError = (): void => {
    body.textContent = '';
    const pre = document.createElement('pre');
    pre.className = 'milkdown-diagram-error';
    pre.textContent = chart;
    body.appendChild(pre);
  };

  const renderEmpty = (): void => {
    body.textContent = '';
    const hint = document.createElement('div');
    hint.className = 'milkdown-diagram-empty';
    hint.textContent = 'Mermaid diagram';
    body.appendChild(hint);
  };

  const setChart = (next: string): void => {
    chart = next;
    if (chart.trim() === '') {
      renderEmpty();
    } else {
      renderSvg();
    }
  };

  const unregister = registerDiagramRerender(() => {
    setChart(chart);
  });

  setChart(chart);

  return {
    dom: root,
    update(updatedNode: Node) {
      if (updatedNode.type.name !== id) {
        return false;
      }
      if (updatedNode.attrs.value === node.attrs.value) {
        return true;
      }
      node = updatedNode;
      setChart((updatedNode.attrs.value as string) ?? '');
      return true;
    },
    stopEvent(event: Event) {
      return false;
    },
    destroy() {
      cancelled = true;
      unregister();
      root.remove();
    },
  };
}

export const diagramNodeView = $view(diagramSchema.node, () => createDiagramView);

export const insertDiagramInputRule = $inputRule(ctx => {
  return new InputRule(/^```mermaid$/, (state, _match, start, end) => {
    const nodeType = diagramSchema.type(ctx);
    const $start = state.doc.resolve(start);
    if (!$start.node(-1).canReplaceWith($start.index(-1), $start.indexAfter(-1), nodeType)) {
      return null;
    }
    return state.tr.delete(start, end).setBlockType(start, start, nodeType, {
      value: '',
      identity: nextDiagramId(),
    });
  });
});
