export function formatDate(iso: string, locale: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format a SQLite `YYYY-MM-DD HH:MM:SS` UTC timestamp for display. Returns the
 * raw value when it cannot be parsed, so bad data degrades gracefully.
 */
export function formatTimestamp(value: string, locale: string): string {
  const date = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** Human file size (B/KB/MB/GB). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let i = 0;

  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
}

export function estimateReadingMinutes(text: string): number {
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

export function excerptFromMarkdown(markdown: string, max = 160): string {
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, ' ')
    .replace(/[`*_>~|#\-[\]()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return plain.length > max ? `${plain.slice(0, max).trim()}…` : plain;
}
