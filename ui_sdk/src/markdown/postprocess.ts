import { getUiLib, loadUiChunk } from '../lazy-chunks';
import { nextDiagramId, renderMermaidChart } from './mermaid';
import { buildVideoElement } from './video-element';

interface KatexApi {
  renderToString(input: string, options?: Record<string, unknown>): string;
}

interface HljsApi {
  getLanguage(name: string): unknown;
  highlight(code: string, options: { language: string }): { value: string };
  highlightAuto(code: string): { value: string };
}

/**
 * Language of a fenced code block. Milkdown serializes code blocks as
 * `<pre data-language>` while other sources may emit the CommonMark
 * `<code class="language-x">` shape; accept both.
 */
function codeLanguage(pre: Element, code: Element | null): string | null {
  const dataLanguage = pre.getAttribute('data-language');

  if (dataLanguage !== null && dataLanguage !== '') {
    return dataLanguage.toLowerCase();
  }

  const match = /\blanguage-([\w+-]+)/.exec(code?.className ?? '');

  return match === null ? null : match[1].toLowerCase();
}

async function convertLatexBlocks(body: HTMLElement): Promise<void> {
  const blocks = Array.from(body.querySelectorAll('pre')).filter(
    pre => codeLanguage(pre, pre.querySelector(':scope > code')) === 'latex',
  );

  if (blocks.length === 0) {
    return;
  }

  await loadUiChunk('ui-sdk-katex.mjs', () => getUiLib<KatexApi>('katex') !== null);

  const katex = getUiLib<KatexApi>('katex');

  if (katex === null) {
    return;
  }

  for (const pre of blocks) {
    const code = pre.querySelector(':scope > code');
    const source = code?.textContent ?? '';
    const wrapper = document.createElement('div');
    wrapper.className = 'md-math-display my-6 overflow-x-auto';
    wrapper.innerHTML = katex.renderToString(source, {
      throwOnError: false,
      displayMode: true,
    });
    pre.replaceWith(wrapper);
  }
}

async function renderMermaidDivs(body: HTMLElement): Promise<void> {
  const divs = Array.from(body.querySelectorAll('[data-type="diagram"]'));

  await Promise.all(
    divs.map(async el => {
      const chart = el.getAttribute('data-value') ?? el.textContent ?? '';
      const holder = document.createElement('div');
      holder.className = 'md-mermaid my-6 flex justify-center overflow-x-auto';
      el.replaceWith(holder);

      if (chart.trim() === '') {
        return;
      }

      try {
        const svg = await renderMermaidChart(chart, nextDiagramId());
        holder.innerHTML = svg;
      } catch {
        holder.className =
          'md-mermaid-error my-6 rounded-lg border border-destructive/30 bg-destructive/5 p-4';
        const pre = document.createElement('pre');
        pre.className = 'overflow-x-auto text-xs';
        pre.textContent = chart;
        holder.appendChild(pre);
      }
    }),
  );
}

/**
 * Highlight every fenced code block and wrap it in the `.md-codeblock`
 * shell (language label + copy button) the article CSS styles. Loads
 * highlight.js on demand so articles without code never pay for it.
 */
async function highlightCodeBlocks(body: HTMLElement): Promise<void> {
  const blocks = Array.from(body.querySelectorAll('pre')).filter(pre => {
    const language = codeLanguage(pre, pre.querySelector(':scope > code'));
    return language !== 'mermaid' && language !== 'latex';
  });

  if (blocks.length === 0) {
    return;
  }

  await loadUiChunk('ui-sdk-highlight.mjs', () => getUiLib<HljsApi>('hljs') !== null);

  const hljs = getUiLib<HljsApi>('hljs');

  if (hljs === null) {
    return;
  }

  for (const pre of blocks) {
    const code = pre.querySelector(':scope > code');

    if (code === null) {
      continue;
    }

    const language = codeLanguage(pre, code);
    const source = code.textContent ?? '';

    try {
      const result =
        language !== null && hljs.getLanguage(language) !== undefined
          ? hljs.highlight(source, { language })
          : hljs.highlightAuto(source);
      code.innerHTML = result.value;
      code.className = `hljs${language === null ? '' : ` language-${language}`}`;
    } catch {
      // Leave the plain-text code as-is if highlighting fails.
    }

    const header = document.createElement('div');
    header.className = 'md-codeblock-header';

    const label = document.createElement('span');
    label.className = 'md-codeblock-lang';
    label.textContent = language ?? 'text';

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'md-copy';
    copy.textContent = 'Copy';

    header.append(label, copy);

    const shell = document.createElement('div');
    shell.className = 'md-codeblock';
    pre.replaceWith(shell);
    shell.append(header, pre);
  }
}

function convertVideoImages(body: HTMLElement): void {
  for (const img of Array.from(body.querySelectorAll('img'))) {
    const player = buildVideoElement({
      src: img.getAttribute('src') ?? '',
      alt: img.getAttribute('alt') ?? '',
      autoplay: img.getAttribute('data-autoplay') === 'true',
      width: toNumberOrNull(img.getAttribute('width')),
      height: toNumberOrNull(img.getAttribute('height')),
      className: img.getAttribute('class') ?? '',
    });

    if (player === null) {
      continue;
    }

    img.replaceWith(player);
  }
}

function toNumberOrNull(value: string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function externalizeLinks(body: HTMLElement): void {
  for (const a of Array.from(body.querySelectorAll('a'))) {
    const href = a.getAttribute('href') ?? '';

    if (/^https?:\/\//.test(href)) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  }
}

/**
 * Post-process the `getHTML()` output so it renders the same way the
 * editor (and the old react-markdown pipeline) did: block math → KaTeX
 * display, mermaid divs → SVG, fenced code → highlighted `.md-codeblock`,
 * video images → players, external links → new tab.
 *
 * KaTeX, mermaid and highlight.js are loaded on demand, only when the
 * article actually contains math, a diagram or a code block.
 */
export async function postProcessHtml(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;

  await convertLatexBlocks(body);
  await renderMermaidDivs(body);
  await highlightCodeBlocks(body);
  convertVideoImages(body);
  externalizeLinks(body);

  return body.innerHTML;
}
