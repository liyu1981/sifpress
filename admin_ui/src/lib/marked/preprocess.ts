/**
 * micromark-extension-gfm-table treats every `|` in a row as a cell
 * divider and has no code-span awareness, so a cell like `` `|640` ``
 * splits into three broken columns. This preprocessor escapes pipes
 * that sit inside backtick code spans within table rows (`\|`), which
 * the table parser handles and re-renders as a literal pipe inside the
 * code span. Non-table content is never touched.
 */
export function escapeTableCodePipes(source: string): string {
  const lines = source.split('\n');
  let inFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }

    if (inFence || !line.includes('|')) {
      continue;
    }

    if (!isTableDelimiterRow(line)) {
      continue;
    }

    let start = i;
    while (start > 0 && lines[start - 1].trim() !== '' && lines[start - 1].includes('|')) {
      start--;
    }

    let end = i + 1;
    while (end < lines.length && lines[end].trim() !== '' && lines[end].includes('|')) {
      end++;
    }

    for (let j = start; j < end; j++) {
      lines[j] = escapePipesInCodeSpans(lines[j]);
    }

    i = end - 1;
  }

  return lines.join('\n');
}

function isTableDelimiterRow(line: string): boolean {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = body.split('|').map(cell => cell.trim());

  return cells.length >= 2 && cells.every(cell => /^:?-+:?$/.test(cell));
}

function escapePipesInCodeSpans(line: string): string {
  let out = '';
  let delimiter = 0;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (char === '`') {
      let run = 0;
      while (i + run < line.length && line[i + run] === '`') {
        run++;
      }
      if (delimiter === 0) {
        delimiter = run;
      } else if (run === delimiter) {
        delimiter = 0;
      }
      out += '`'.repeat(run);
      i += run;
      continue;
    }

    if (delimiter !== 0 && char === '|') {
      // A pipe already escaped by a previous save cycle (`\|`) must not be
      // escaped again, or it would render as a literal `\|`.
      if (i > 0 && line[i - 1] === '\\') {
        out += '|';
        i++;
        continue;
      }
      out += '\\|';
      i++;
      continue;
    }

    out += char;
    i++;
  }

  return out;
}
