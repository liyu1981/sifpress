import type { CrepeBuilder } from '@milkdown/crepe/builder';
import { getHTML } from '@milkdown/kit/utils';
import { log } from '@/lib/logger';
import { escapeTableCodePipes } from './preprocess';
import { createMarkdownEditor, setMarkdownContent } from './shared';

let rendererReady: Promise<CrepeBuilder> | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getRenderer(): Promise<CrepeBuilder> {
  if (rendererReady !== null) {
    log('[MD RENDER] reusing existing renderer');
    return rendererReady;
  }

  log('[MD RENDER] creating new renderer (first time)');
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.display = 'none';
  document.body.appendChild(el);

  const builder = createMarkdownEditor({
    root: el,
    defaultValue: '',
    mode: 'render',
  });

  rendererReady = builder.create().then(() => {
    log('[MD RENDER] renderer ready');
    return builder;
  });

  return rendererReady;
}

/**
 * Render markdown to static HTML via Milkdown's `getHTML()` (shared schema
 * with the editor). Calls are serialized through a promise queue because
 * the hidden renderer instance is a singleton.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  log('[MD RENDER] markdownToHtml called, inputLen=%d', markdown.length);
  const builder = await getRenderer();
  const input = escapeTableCodePipes(markdown);

  log('[MD RENDER] queued markdown set+getHTML');
  const run = queue.then(() => {
    log('[MD RENDER] executing markdown set+getHTML');
    builder.editor.action(setMarkdownContent(input));
    const html = builder.editor.action(getHTML());
    log('[MD RENDER] getHTML returned, htmlLen=%d', html.length);
    return html;
  });

  queue = run.catch(() => undefined);

  return run;
}
