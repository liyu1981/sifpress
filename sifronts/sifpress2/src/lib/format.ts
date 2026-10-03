import { parseFrontMatter } from 'ui-sdk';

const WORDS_PER_MINUTE = 220;

const EXCERPT_LENGTH = 190;

export interface StoryMeta {
  cover: string | null;
  caption: string;
  dek: string;
  excerpt: string;
  readingMinutes: number;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Strip markdown syntax down to readable prose for excerpts and deks. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .replace(/\{[.#][^}]*\}/g, ' ')
    .replace(/^[>#\-+*]+\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function truncate(text: string, max = EXCERPT_LENGTH): string {
  if (text.length <= max) {
    return text;
  }

  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');

  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export function formatDate(value: string, style: 'long' | 'short' | 'day' = 'long'): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  if (style === 'short') {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  if (style === 'day') {
    return date
      .toLocaleDateString('en-US', { weekday: 'long' })
      .concat(', ')
      .concat(date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }));
  }

  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** `Jun 24, 2026` → `2 days ago`, for the "latest" rails. */
export function formatRelative(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) {
    return 'just now';
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes} min ago`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.round(hours / 24);

  if (days < 30) {
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }

  return formatDate(value, 'short');
}

/** Unix-epoch timestamp → the same relative string (search results). */
export function formatEpoch(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }

  const date =
    typeof value === 'number'
      ? new Date(value * 1000)
      : new Date(/^\d+$/.test(value) ? Number(value) * 1000 : value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return formatRelative(date.toISOString());
}

export function readingMinutes(markdown: string): number {
  const words = toPlainText(markdown).split(/\s+/).filter(Boolean).length;

  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/**
 * Everything the editorial cards need from a page body: cover image, standfirst
 * and reading time. `dek`/`description` front matter wins; otherwise the first
 * prose paragraph becomes the standfirst.
 */
export function readStoryMeta(contentMd: string): StoryMeta {
  const { data, content } = parseFrontMatter(contentMd);

  const blocks = content
    .split(/\n{2,}/)
    .map(block => block.trim())
    .filter(block => block !== '' && !/^(```|#{1,6}\s|>|!\[|\|)/.test(block));

  const lead = blocks.find(block => /^[^<>*_!`|-]/.test(block)) ?? '';
  const leadText = toPlainText(lead);

  const description = asString(data.description) || asString(data.dek) || asString(data.subtitle);

  return {
    cover: asString(data.cover) || asString(data.image) || asString(data.thumbnail) || null,
    caption: asString(data.caption),
    dek: description || truncate(leadText, 220),
    excerpt: truncate(leadText),
    readingMinutes: readingMinutes(contentMd),
  };
}
