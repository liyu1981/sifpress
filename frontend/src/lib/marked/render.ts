import type { CrepeBuilder } from '@milkdown/crepe/builder';
import { getHTML } from '@milkdown/kit/utils';
import { escapeTableCodePipes } from './preprocess';
import { createMarkdownEditor, setMarkdownContent } from './shared';

let renderer: CrepeBuilder | null = null;
let rendererEl: HTMLDivElement | null = null;
let queue: Promise<unknown> = Promise.resolve();

function getRenderer(): Promise<CrepeBuilder> {
  if (renderer !== null) {
    return Promise.resolve(renderer);
  }

  rendererEl = document.createElement('div');
  rendererEl.setAttribute('aria-hidden', 'true');
  rendererEl.style.position = 'fixed';
  rendererEl.style.top = '-10000px';
  rendererEl.style.left = '-10000px';
  rendererEl.style.width = '0';
  rendererEl.style.height = '0';
  rendererEl.style.overflow = 'hidden';
  document.body.appendChild(rendererEl);

  const builder = createMarkdownEditor({
    root: rendererEl,
    defaultValue: '',
    mode: 'render',
  });
  renderer = builder;

  return builder.create().then(() => builder);
}

/**
 * Render markdown to static HTML via Milkdown's `getHTML()` (shared schema
 * with the editor). Calls are serialized through a promise queue because
 * the hidden renderer instance is a singleton.
 */
export async function markdownToHtml(markdown: string): Promise<string> {
  const builder = await getRenderer();
  const input = escapeTableCodePipes(markdown);

  const run = queue.then(() => {
    builder.editor.action(setMarkdownContent(input));
    return builder.editor.action(getHTML());
  });

  queue = run.catch(() => undefined);

  return run;
}
