import { TooltipProvider, tooltipFactory } from '@milkdown/kit/plugin/tooltip';
import type { Ctx } from '@milkdown/kit/ctx';
import type { Node } from '@milkdown/kit/prose/model';
import type { EditorState, PluginView } from '@milkdown/kit/prose/state';
import { NodeSelection } from '@milkdown/kit/prose/state';
import type { EditorView } from '@milkdown/kit/prose/view';

export const diagramTooltip = tooltipFactory('DIAGRAM');

const DIAGRAM_TYPE = 'diagram';

const confirmIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M9.00012 16.1998L5.50012 12.6998C5.11012 12.3098 4.49012 12.3098 4.10012 12.6998C3.71012 13.0898 3.71012 13.7098 4.10012 14.0998L8.29012 18.2898C8.68012 18.6798 9.31012 18.6798 9.70012 18.2898L20.3001 7.69982C20.6901 7.30982 20.6901 6.68982 20.3001 6.29982C19.9101 5.90982 19.2901 5.90982 18.9001 6.29982L9.00012 16.1998Z" fill="currentColor"/></svg>`;

class DiagramTooltipView implements PluginView {
  readonly #tooltipProvider: TooltipProvider;
  readonly #content: HTMLElement;
  #view: EditorView;
  #currentNode: Node | null = null;
  #textarea: HTMLTextAreaElement | null = null;

  constructor(view: EditorView) {
    this.#view = view;

    this.#content = document.createElement('div');
    this.#content.className = 'milkdown-diagram-tooltip';

    const textarea = document.createElement('textarea');
    textarea.className = 'milkdown-diagram-tooltip-input';
    textarea.spellcheck = false;
    this.#textarea = textarea;
    this.#content.appendChild(textarea);

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'milkdown-diagram-tooltip-confirm';
    confirmBtn.innerHTML = confirmIcon;
    confirmBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      this.#commit();
    });
    this.#content.appendChild(confirmBtn);

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.#commit();
      }
      e.stopPropagation();
    });

    this.#tooltipProvider = new TooltipProvider({
      content: this.#content,
      shouldShow: v => this.#isDiagramSelection(v),
      offset: 10,
      floatingUIOptions: { placement: 'bottom' },
    });

    this.#tooltipProvider.onShow = () => {
      if (this.#currentNode && this.#textarea) {
        this.#textarea.value = (this.#currentNode.attrs.value as string) ?? '';
        setTimeout(() => {
          this.#textarea?.focus();
          this.#textarea?.setSelectionRange(
            this.#textarea.value.length,
            this.#textarea.value.length,
          );
        }, 0);
      }
    };

    this.update(view);
  }

  #isDiagramSelection = (view: EditorView): boolean => {
    const { selection } = view.state;
    if (!view.editable) return false;
    if (!(selection instanceof NodeSelection)) return false;
    if (selection.node.type.name !== DIAGRAM_TYPE) return false;
    this.#currentNode = selection.node;
    return true;
  };

  #commit = (): void => {
    if (!this.#textarea || !this.#currentNode) return;
    const { selection, tr } = this.#view.state;
    if (!(selection instanceof NodeSelection)) return;

    const next = this.#textarea.value;
    const from = selection.from;
    this.#view.dispatch(
      tr
        .setNodeMarkup(from, undefined, {
          ...this.#currentNode.attrs,
          value: next,
        })
        .setSelection(NodeSelection.create(tr.doc, from)),
    );
    this.#tooltipProvider.hide();
    this.#view.focus();
  };

  update = (view: EditorView, prevState?: EditorState): void => {
    this.#view = view;
    this.#tooltipProvider.update(view, prevState);
  };

  destroy = (): void => {
    this.#tooltipProvider.destroy();
    this.#content.remove();
  };
}

export function configureDiagramTooltip() {
  return (ctx: Ctx) => {
    ctx.set(diagramTooltip.key, {
      view: (view: EditorView) => new DiagramTooltipView(view),
    });
  };
}
