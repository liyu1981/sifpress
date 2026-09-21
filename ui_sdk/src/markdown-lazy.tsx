import { useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import type { CrepeBuilder } from '@milkdown/crepe/builder';
import type { Ctx } from '@milkdown/kit/ctx';
import { getUiLib, loadUiChunk } from './lazy-chunks';
import type { MarkdownViewProps, MarkdownViewTheme } from './markdown/view';
import type { MarkdownEditorConfig } from './markdown/shared';
import type { MermaidTheme } from './markdown/mermaid';

export type { MarkdownViewProps, MarkdownViewTheme, MarkdownEditorConfig, MermaidTheme };

/**
 * The render/edit pipeline published by the `ui-sdk-markdown.mjs` chunk. It
 * is intentionally absent from the core bundle: Milkdown, Crepe, Vue,
 * CodeMirror and ProseMirror only load when an article actually renders
 * markdown or the admin opens the editor.
 */
export interface MarkdownLib {
  MarkdownView: ComponentType<MarkdownViewProps>;
  markdownToHtml: (markdown: string) => Promise<string>;
  postProcessHtml: (html: string) => Promise<string>;
  createMarkdownEditor: (config: MarkdownEditorConfig) => CrepeBuilder;
  setMarkdownContent: (markdown: string) => (ctx: Ctx) => void;
  setMermaidTheme: (theme: MermaidTheme) => void;
}

const MARKDOWN_CHUNK = 'ui-sdk-markdown.mjs';

/** The markdown chunk's API, or `null` until it has executed. */
export function markdownLib(): MarkdownLib | null {
  return getUiLib<MarkdownLib>('markdown');
}

/** Load (once) and return the markdown chunk's API. */
export function loadMarkdown(): Promise<MarkdownLib> {
  return loadUiChunk(MARKDOWN_CHUNK, () => markdownLib() !== null).then(() => {
    const lib = markdownLib();

    if (lib === null) {
      throw new Error('ui-sdk markdown chunk did not publish its API');
    }

    return lib;
  });
}

function requireMarkdown(): MarkdownLib {
  const lib = markdownLib();

  if (lib === null) {
    throw new Error('ui-sdk markdown chunk is not loaded yet; await loadMarkdown() first');
  }

  return lib;
}

/**
 * Drop-in replacement for the real `MarkdownView` that first loads the
 * markdown chunk, then delegates to it. Renders nothing for the brief moment
 * before the chunk resolves.
 */
export function MarkdownView(props: MarkdownViewProps) {
  const [View, setView] = useState<ComponentType<MarkdownViewProps> | null>(
    () => markdownLib()?.MarkdownView ?? null,
  );

  useEffect(() => {
    if (View !== null) {
      return;
    }

    let alive = true;

    loadMarkdown()
      .then(lib => {
        if (alive) {
          setView(() => lib.MarkdownView);
        }
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, [View]);

  return View === null ? null : <View {...props} />;
}

export function markdownToHtml(markdown: string): Promise<string> {
  return loadMarkdown().then(lib => lib.markdownToHtml(markdown));
}

export function postProcessHtml(html: string): Promise<string> {
  return loadMarkdown().then(lib => lib.postProcessHtml(html));
}

export function createMarkdownEditor(config: MarkdownEditorConfig): CrepeBuilder {
  return requireMarkdown().createMarkdownEditor(config);
}

export function setMarkdownContent(markdown: string): (ctx: Ctx) => void {
  return requireMarkdown().setMarkdownContent(markdown);
}

export function setMermaidTheme(theme: MermaidTheme): void {
  requireMarkdown().setMermaidTheme(theme);
}
