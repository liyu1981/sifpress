import hljs from 'highlight.js/lib/common';
import katex from 'katex';
import { nextDiagramId, renderMermaidChart } from './mermaid';
import { buildVideoElement } from './video-element';

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

function convertLatexBlocks(body: HTMLElement): void {
  for (const pre of Array.from(body.querySelectorAll('pre'))) {
    const code = pre.querySelector(':scope > code');

    if (codeLanguage(pre, code) !== 'latex') {
      continue;
    }

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
 * shell (language label + copy button) the article CSS styles.
 */
function highlightCodeBlocks(body: HTMLElement): void {
  for (const pre of Array.from(body.querySelectorAll('pre'))) {
    const code = pre.querySelector(':scope > code');

    if (code === null) {
      continue;
    }

    const language = codeLanguage(pre, code);

    if (language === 'mermaid' || language === 'latex') {
      continue;
    }

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
 */
export async function postProcessHtml(html: string): Promise<string> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;

  convertLatexBlocks(body);
  await renderMermaidDivs(body);
  highlightCodeBlocks(body);
  convertVideoImages(body);
  externalizeLinks(body);

  return body.innerHTML;
}
