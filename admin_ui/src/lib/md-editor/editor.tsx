import type { CrepeBuilder } from '@milkdown/crepe/builder';
import { blockEdit } from '@milkdown/crepe/feature/block-edit';
import { cursor } from '@milkdown/crepe/feature/cursor';
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip';
import { listItem } from '@milkdown/crepe/feature/list-item';
import { placeholder } from '@milkdown/crepe/feature/placeholder';
import { table } from '@milkdown/crepe/feature/table';
import { toolbar } from '@milkdown/crepe/feature/toolbar';
import type { Ctx } from '@milkdown/kit/ctx';
import { commandsCtx, editorViewCtx, parserCtx, serializerCtx } from '@milkdown/kit/core';
import {
  headingSchema,
  paragraphSchema,
  setBlockTypeCommand,
} from '@milkdown/kit/preset/commonmark';
import { TextSelection } from '@milkdown/kit/prose/state';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  createMarkdownEditor,
  type MermaidTheme,
  escapeTableCodePipes,
  setMarkdownContent,
  setMermaidTheme,
} from 'ui-sdk';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';
import { configureDiagramTooltip, diagramTooltip } from './plugins/diagram-tooltip';
import {
  configureImageDirectiveTooltip,
  imageDirectiveTooltip,
} from './plugins/image-directives-tooltip';
import { imageDirectivesView } from './plugins/image-directives-view';
import { BlockTypeMenu } from './block-type-menu';

export interface EditorSelection {
  /** ProseMirror document positions (expanded to whole top-level blocks). */
  from: number;
  to: number;
  markdown: string;
}

export interface EditorSelectionContext {
  /** Serialized lines of the top-level blocks immediately before the selection. */
  before: string[];
  /** Serialized lines of the top-level blocks immediately after the selection. */
  after: string[];
  /** 1-based document line number of the selection's first line. */
  startLine: number;
}

export interface MilkdownEditorHandle {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  /**
   * The current selection as markdown, expanded outwards to whole top-level
   * blocks (no partial blocks). `null` when nothing is selected.
   */
  getSelection: () => EditorSelection | null;
  /**
   * Surrounding document lines around a selection range, for the review
   * dialog. Defaults to the current selection; pass a captured range so the
   * context stays correct after the editor selection moves.
   * Display-only: never fed back into document recomposition.
   */
  getSelectionContext: (
    range?: { from: number; to: number },
    maxLines?: number,
  ) => EditorSelectionContext | null;
  /** Replace a captured block range with markdown. */
  applyToSelection: (markdown: string, range: { from: number; to: number }) => boolean;
  /** Whether the editor currently has a non-empty block selection (for the agent button). */
  hasSelection: () => boolean;
  /**
   * Close every open editor popup (image/video directive panel, diagram
   * editor, latex edit, toolbar, link tooltip, slash menu). Needed before
   * hiding the editor (e.g. switching to the markdown source tab): some
   * popups mount to document.body, so they would stay visible, and the rest
   * would reappear when the editor is shown again.
   */
  closePopups: () => void;
}

export interface MilkdownEditorProps {
  defaultValue?: string;
  onUpload?: (file: File) => Promise<string>;
  className?: string;
}

/** Toolbar icon for the block-type dropdown (rendered via crepe's `Icon`). */
const BLOCK_TYPE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="2.2" rx="1.1"/><rect x="4" y="10.9" width="16" height="2.2" rx="1.1"/><rect x="4" y="16.8" width="10" height="2.2" rx="1.1"/></svg>`;

/** Heading level of the block at the caret, or null for a paragraph. */
function currentBlockTypeLevel(ctx: Ctx): number | null {
  const node = ctx.get(editorViewCtx).state.selection.$from.parent;
  if (node.type !== headingSchema.type(ctx)) {
    return null;
  }
  return node.attrs.level as number;
}

/** Turn the selected block into a heading level (or back into a paragraph). */
function setBlockType(ctx: Ctx, level: number | null): void {
  const commands = ctx.get(commandsCtx);
  if (level === null) {
    commands.call(setBlockTypeCommand.key, { nodeType: paragraphSchema.type(ctx) });
    return;
  }
  commands.call(setBlockTypeCommand.key, {
    nodeType: headingSchema.type(ctx),
    attrs: { level },
  });
}

export const MilkdownEditor = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(
  function MilkdownEditor({ defaultValue = '', onUpload, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const builderRef = useRef<CrepeBuilder | null>(null);
    const [blockMenu, setBlockMenu] = useState<{ rect: DOMRect; ctx: Ctx } | null>(null);
    const { theme } = useTheme();

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => builderRef.current?.getMarkdown() ?? '',
        setMarkdown: (markdown: string) => {
          builderRef.current?.editor.action(setMarkdownContent(escapeTableCodePipes(markdown)));
        },
        closePopups: () => {
          setBlockMenu(null);
          const builder = builderRef.current;
          if (!builder) {
            return;
          }

          // Collapsing the selection makes every selection-driven popup hide
          // itself through its own TooltipProvider update, which also runs
          // their cleanup (e.g. the latex edit destroys its inner view).
          builder.editor.action(ctx => {
            const view = ctx.get(editorViewCtx);
            const { selection } = view.state;
            if (selection.empty) {
              return;
            }
            view.dispatch(
              view.state.tr
                .setSelection(TextSelection.near(view.state.doc.resolve(selection.head)))
                .setMeta('addToHistory', false),
            );
          });

          // Caret-anchored popups (slash menu) and hover previews don't depend
          // on the selection; flip their data-show directly. This also covers
          // popups mounted on document.body, which live outside the editor DOM.
          for (const el of document.querySelectorAll<HTMLElement>('[data-show="true"]')) {
            el.dataset.show = 'false';
          }
        },
        getSelection: () => {
          const builder = builderRef.current;
          if (builder === null) {
            return null;
          }
          return builder.editor.action(ctx => {
            const view = ctx.get(editorViewCtx);
            const serializer = ctx.get(serializerCtx);
            const { from, to } = view.state.selection;
            if (from === to) {
              return null;
            }
            const $from = view.state.doc.resolve(from);
            const $to = view.state.doc.resolve(to);
            if ($from.depth < 1 || $to.depth < 1) {
              return null;
            }
            const start = $from.before(1);
            const end = $to.after(1);
            if (start >= end) {
              return null;
            }
            const slice = view.state.doc.slice(start, end);
            const topNode = view.state.schema.topNodeType.create(null, slice.content);
            return { from: start, to: end, markdown: serializer(topNode) };
          });
        },
        getSelectionContext: (range, maxLines = 8) => {
          const builder = builderRef.current;
          if (builder === null) {
            return null;
          }
          return builder.editor.action(ctx => {
            const view = ctx.get(editorViewCtx);
            const serializer = ctx.get(serializerCtx);
            const doc = view.state.doc;
            const { from, to } = range ?? view.state.selection;
            if (from >= to) {
              return null;
            }
            const topNodeType = view.state.schema.topNodeType;

            const childPos = (index: number): number => {
              let pos = 0;
              for (let i = 0; i < index; i += 1) {
                pos += doc.child(i).nodeSize;
              }
              return pos;
            };

            // Boundary positions (0, or between top-level blocks) resolve to
            // depth 0, so map them to child indices directly instead.
            const indexAt = (pos: number): number => {
              let index = 0;
              while (index < doc.childCount && childPos(index + 1) <= pos) {
                index += 1;
              }
              return index;
            };

            const fromIndex = indexAt(from);
            const toIndex = Math.max(fromIndex, indexAt(to) - 1);

            const serializeRange = (startIndex: number, endIndex: number): string[] => {
              if (startIndex >= endIndex) {
                return [];
              }
              const slice = doc.slice(childPos(startIndex), childPos(endIndex));
              const topNode = topNodeType.create(null, slice.content);
              const lines = serializer(topNode).split('\n');
              if (lines.length > 0 && lines[lines.length - 1] === '') {
                lines.pop();
              }
              return lines;
            };

            const prefix = serializeRange(0, fromIndex);
            const suffix = serializeRange(toIndex + 1, doc.childCount);
            return {
              before: prefix.slice(-maxLines),
              after: suffix.slice(0, maxLines),
              startLine: prefix.length + 1,
            };
          });
        },
        applyToSelection: (markdown, range) => {
          const builder = builderRef.current;
          if (builder === null) {
            return false;
          }
          return builder.editor.action(ctx => {
            const view = ctx.get(editorViewCtx);
            const parser = ctx.get(parserCtx);
            const size = view.state.doc.content.size;
            if (range.from < 0 || range.to > size || range.from >= range.to) {
              return false;
            }
            try {
              const doc = parser(escapeTableCodePipes(markdown));
              view.dispatch(
                view.state.tr.replaceWith(range.from, range.to, doc.content).scrollIntoView(),
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        hasSelection: () => {
          const builder = builderRef.current;
          if (builder === null) {
            return false;
          }
          return builder.editor.action(ctx => {
            const view = ctx.get(editorViewCtx);
            return view.hasFocus() && !view.state.selection.empty;
          });
        },
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const builder = createMarkdownEditor({
        root: container,
        defaultValue,
        mode: 'edit',
      });

      builder.addFeature(listItem);
      builder.addFeature(linkTooltip);
      builder.addFeature(cursor);
      builder.addFeature(placeholder);
      builder.addFeature(table);
      builder.addFeature(toolbar, {
        buildToolbar: groupBuilder => {
          groupBuilder.addGroup('block', 'Block').addItem('block-type', {
            icon: BLOCK_TYPE_ICON,
            label: 'Block type',
            active: () => false,
            onRun: ctx => {
              const trigger = document.querySelector<HTMLElement>(
                '[data-toolbar-item="block-type"]',
              );
              if (trigger === null) {
                return;
              }
              setBlockMenu(prev => (prev ? null : { rect: trigger.getBoundingClientRect(), ctx }));
            },
          });
          // Move the block-type group to the front: the toolbar inserts a
          // divider before every group after the first, so this renders as
          // [block type] | [inline formatting...]. `build()` returns the live
          // group array that `getGroups` then returns.
          const groups = groupBuilder.build();
          const block = groups.pop();
          if (block !== undefined) {
            groups.unshift(block);
          }
        },
      });
      builder.addFeature(blockEdit);

      builder.editor
        .use(imageDirectivesView)
        .config(configureImageDirectiveTooltip(onUpload))
        .use(imageDirectiveTooltip)
        .config(configureDiagramTooltip())
        .use(diagramTooltip);

      builderRef.current = builder;
      void builder.create();

      return () => {
        builderRef.current = null;
        void builder.destroy();
      };
      // Mount once; live updates flow through the handle, not re-mounting.
    }, []);

    const resolved: MermaidTheme =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;

    useEffect(() => {
      setMermaidTheme(resolved);
    }, [resolved]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      let wasEqShown = false;
      let wasDiagShown = false;
      const timers = new Set<ReturnType<typeof setTimeout>>();

      const schedule = (fn: () => void): void => {
        const id = setTimeout(() => {
          timers.delete(id);
          fn();
        }, 100);
        timers.add(id);
      };

      const observer = new MutationObserver(() => {
        const eqEdit = container.querySelector('.milkdown-latex-inline-edit');
        const eqShown = eqEdit?.getAttribute('data-show') === 'true';

        if (eqShown && !wasEqShown) {
          schedule(() => {
            const prose = eqEdit?.querySelector('.ProseMirror');
            if (prose instanceof HTMLElement) {
              prose.focus();
              const range = document.createRange();
              range.selectNodeContents(prose);
              range.collapse(false);
              const sel = window.getSelection();
              sel?.removeAllRanges();
              sel?.addRange(range);
            }
          });
        }
        wasEqShown = eqShown;

        const diagTooltip = container.querySelector('.milkdown-diagram-tooltip');
        const diagShown = diagTooltip?.getAttribute('data-show') === 'true';

        if (diagShown && !wasDiagShown) {
          schedule(() => {
            const textarea = diagTooltip?.querySelector('.milkdown-diagram-tooltip-input');
            if (textarea instanceof HTMLTextAreaElement) {
              textarea.focus();
              textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }
          });
        }
        wasDiagShown = diagShown;
      });

      observer.observe(container, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-show'],
      });

      return () => {
        observer.disconnect();
        for (const id of timers) {
          clearTimeout(id);
        }
        timers.clear();
      };
    }, []);

    return (
      <>
        <div
          ref={containerRef}
          className={cn('milkdown-editor', resolved === 'dark' && 'dark', className)}
        />
        {blockMenu !== null &&
          createPortal(
            <BlockTypeMenu
              rect={blockMenu.rect}
              currentLevel={currentBlockTypeLevel(blockMenu.ctx)}
              onSelect={level => {
                setBlockType(blockMenu.ctx, level);
                setBlockMenu(null);
              }}
              onClose={() => setBlockMenu(null)}
            />,
            document.body,
          )}
      </>
    );
  },
);
