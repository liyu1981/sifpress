import { diffArrays } from 'diff';

/**
 * Line-oriented diff used by the review dialog. We diff arrays of lines
 * (rather than newline-joined strings) so trailing newlines are preserved
 * exactly and recomposition stays lossless.
 */

export interface DiffContextBlock {
  kind: 'context';
  lines: string[];
}

export interface DiffChangeBlock {
  kind: 'change';
  id: string;
  removed: string[];
  added: string[];
}

export type DiffBlock = DiffContextBlock | DiffChangeBlock;

/**
 * Per-change text overrides produced by inline editing. Keyed by change block
 * id; the value replaces the block's `added` lines (same length).
 */
export type ChangeEdits = ReadonlyMap<string, readonly string[]>;

export interface DiffResult {
  blocks: DiffBlock[];
  changeCount: number;
  addedLines: number;
  removedLines: number;
}

function splitLines(value: string): string[] {
  return value.split('\n');
}

export function buildDiff(before: string, after: string): DiffResult {
  const changes = diffArrays(splitLines(before), splitLines(after));
  const blocks: DiffBlock[] = [];
  let changeIndex = 0;
  let addedLines = 0;
  let removedLines = 0;

  for (let i = 0; i < changes.length; ) {
    const change = changes[i];

    if (!change.added && !change.removed) {
      blocks.push({ kind: 'context', lines: change.value });
      i += 1;
      continue;
    }

    const removed: string[] = [];
    const added: string[] = [];

    while (i < changes.length && (changes[i].added || changes[i].removed)) {
      if (changes[i].removed) {
        removed.push(...changes[i].value);
      } else {
        added.push(...changes[i].value);
      }
      i += 1;
    }

    if (removed.length === 0 && added.length === 0) {
      continue;
    }

    blocks.push({ kind: 'change', id: `c${changeIndex++}`, removed, added });
    addedLines += added.length;
    removedLines += removed.length;
  }

  return { blocks, changeCount: changeIndex, addedLines, removedLines };
}

export interface DiffLineInput {
  type: 'add' | 'remove' | 'same';
  content: string;
}

/**
 * Convert the server's flat revision diff (`pagesApi.revisionDiff`, produced by
 * `line_diff()` in api.php) into the block model, so the same read-only
 * `ReviewDiffView` can render revision history.
 */
export function blocksFromDiffLines(lines: readonly DiffLineInput[]): DiffBlock[] {
  const blocks: DiffBlock[] = [];
  let changeIndex = 0;

  for (let i = 0; i < lines.length; ) {
    if (lines[i].type === 'same') {
      const context: string[] = [];
      while (i < lines.length && lines[i].type === 'same') {
        context.push(lines[i].content);
        i += 1;
      }
      blocks.push({ kind: 'context', lines: context });
      continue;
    }

    const removed: string[] = [];
    const added: string[] = [];
    while (i < lines.length && lines[i].type !== 'same') {
      if (lines[i].type === 'remove') {
        removed.push(lines[i].content);
      } else {
        added.push(lines[i].content);
      }
      i += 1;
    }

    blocks.push({ kind: 'change', id: `c${changeIndex++}`, removed, added });
  }

  return blocks;
}

/** The added lines for a block, honouring any inline edits. */
export function addedFor(block: DiffChangeBlock, edits?: ChangeEdits): readonly string[] {
  return edits?.get(block.id) ?? block.added;
}

/** Rebuild content from the baseline, substituting rejected/edited changes. */
export function recompose(
  blocks: DiffBlock[],
  reverted: ReadonlySet<string>,
  edits?: ChangeEdits,
): string {
  const out: string[] = [];

  for (const block of blocks) {
    if (block.kind === 'context') {
      out.push(...block.lines);
    } else {
      out.push(...(reverted.has(block.id) ? block.removed : addedFor(block, edits)));
    }
  }

  return out.join('\n');
}

export interface ChangeStats {
  kept: number;
  reverted: number;
  total: number;
  addedLines: number;
  removedLines: number;
}

export function changeStats(blocks: DiffBlock[], reverted: ReadonlySet<string>): ChangeStats {
  let kept = 0;
  let addedLines = 0;
  let removedLines = 0;
  let total = 0;

  for (const block of blocks) {
    if (block.kind !== 'change') {
      continue;
    }

    total += 1;

    if (reverted.has(block.id)) {
      continue;
    }

    kept += 1;
    addedLines += block.added.length;
    removedLines += block.removed.length;
  }

  return { kept, reverted: total - kept, total, addedLines, removedLines };
}
