import type { CrepeBuilder } from '@milkdown/crepe/builder';
import { blockEdit } from '@milkdown/crepe/feature/block-edit';
import { cursor } from '@milkdown/crepe/feature/cursor';
import { linkTooltip } from '@milkdown/crepe/feature/link-tooltip';
import { listItem } from '@milkdown/crepe/feature/list-item';
import { placeholder } from '@milkdown/crepe/feature/placeholder';
import { table } from '@milkdown/crepe/feature/table';
import { toolbar } from '@milkdown/crepe/feature/toolbar';
import { editorViewCtx } from '@milkdown/kit/core';
import { TextSelection } from '@milkdown/kit/prose/state';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
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

export interface MilkdownEditorHandle {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
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

export const MilkdownEditor = forwardRef<MilkdownEditorHandle, MilkdownEditorProps>(
  function MilkdownEditor({ defaultValue = '', onUpload, className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const builderRef = useRef<CrepeBuilder | null>(null);
    const { theme } = useTheme();

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => builderRef.current?.getMarkdown() ?? '',
        setMarkdown: (markdown: string) => {
          builderRef.current?.editor.action(setMarkdownContent(escapeTableCodePipes(markdown)));
        },
        closePopups: () => {
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
      builder.addFeature(toolbar);
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
      // eslint-disable-next-line react-hooks/exhaustive-deps
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

      const observer = new MutationObserver(() => {
        const eqEdit = container.querySelector('.milkdown-latex-inline-edit');
        const eqShown = eqEdit?.getAttribute('data-show') === 'true';

        if (eqShown && !wasEqShown) {
          setTimeout(() => {
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
          }, 100);
        }
        wasEqShown = eqShown;

        const diagTooltip = container.querySelector('.milkdown-diagram-tooltip');
        const diagShown = diagTooltip?.getAttribute('data-show') === 'true';

        if (diagShown && !wasDiagShown) {
          setTimeout(() => {
            const textarea = diagTooltip?.querySelector('.milkdown-diagram-tooltip-input');
            if (textarea instanceof HTMLTextAreaElement) {
              textarea.focus();
              textarea.setSelectionRange(textarea.value.length, textarea.value.length);
            }
          }, 100);
        }
        wasDiagShown = diagShown;
      });

      observer.observe(container, {
        subtree: true,
        attributes: true,
        attributeFilter: ['data-show'],
      });

      return () => observer.disconnect();
    }, []);

    return (
      <div
        ref={containerRef}
        className={cn('milkdown-editor', resolved === 'dark' && 'dark', className)}
      />
    );
  },
);
