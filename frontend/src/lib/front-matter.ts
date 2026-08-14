/**
 * Minimal YAML front-matter support (Jekyll/Hugo/Obsidian style):
 *
 *   ---
 *   title: "Hello"
 *   date: 2026-08-10
 *   tags: [announcement, architecture]
 *   cover: "https://example.com/cover.jpg"
 *   published: true
 *   ---
 *
 * Parses a practical YAML subset — quoted/unquoted scalars, inline
 * arrays, booleans, numbers, and `#` comments — into a plain object
 * and returns the body with the front-matter block removed. Documents
 * without a leading front-matter block pass through unchanged.
 */

export interface FrontMatter {
  data: Record<string, unknown>
  content: string
}

const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

export function parseFrontMatter(markdown: string): FrontMatter {
  const match = FRONT_MATTER_RE.exec(markdown)

  if (match === null) {
    return { data: {}, content: markdown }
  }

  return {
    data: parseYamlLines(match[1]),
    content: markdown.slice(match[0].length),
  }
}

export function frontMatterString(
  data: Record<string, unknown>,
  key: string,
): string | null {
  const value = data[key]
  return typeof value === 'string' && value !== '' ? value : null
}

export interface BuildFrontMatterInput {
  title: string
  slug: string
  date?: string
  tags?: string[]
  extra?: Array<{ key: string; value: string }>
}

export const STANDARD_FRONT_MATTER_KEYS = new Set(['title', 'slug', 'date', 'tags'])

function quoteYamlScalar(value: string): string {
  const clean = value.replace(/\r?\n/g, ' ').trim()
  return `"${clean.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

function formatTags(tags: string[]): string {
  if (tags.length === 0) {
    return '[]'
  }
  const inner = tags
    .map((tag) => {
      const clean = tag.trim()
      return /^[\w-]+$/.test(clean) ? clean : quoteYamlScalar(clean)
    })
    .join(', ')
  return `[${inner}]`
}

function formatExtraValue(value: string): string {
  const clean = value.trim()

  if (clean === '') {
    return '""'
  }

  if (/^(?:true|false|null|-?\d+(?:\.\d+)?)$/.test(clean)) {
    return clean
  }

  if (/^[\w\-./:@+%]+$/.test(clean)) {
    return clean
  }

  return quoteYamlScalar(clean)
}

/**
 * Build the YAML front-matter block (with trailing blank line) for the
 * meta fields that live outside the editor body. Standard fields always
 * come first; extra fields (cover, …) are sorted by key. The `tags`
 * inline array keeps `front_matter_tags()` on the backend working.
 */
export function buildFrontMatter({
  title,
  slug,
  date = '',
  tags = [],
  extra = [],
}: BuildFrontMatterInput): string {
  const lines = ['---']
  lines.push(`title: ${quoteYamlScalar(title)}`)
  lines.push(`slug: ${quoteYamlScalar(slug)}`)
  if (date !== '') {
    lines.push(`date: ${date}`)
  }
  lines.push(`tags: ${formatTags(tags)}`)

  const seen = new Set(STANDARD_FRONT_MATTER_KEYS)

  for (const field of [...extra].sort((a, b) => a.key.localeCompare(b.key))) {
    const key = field.key.trim()

    if (key === '' || seen.has(key) || !/^[A-Za-z0-9_-]+$/.test(key)) {
      continue
    }

    seen.add(key)
    lines.push(`${key}: ${formatExtraValue(field.value)}`)
  }

  lines.push('---', '')
  return lines.join('\n')
}

function parseYamlLines(block: string): Record<string, unknown> {
  const data: Record<string, unknown> = {}

  for (const line of block.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (trimmed === '' || trimmed.startsWith('#')) {
      continue
    }

    const match = /^([\w-]+):\s*(.*)$/.exec(trimmed)

    if (match === null) {
      continue
    }

    data[match[1]] = parseScalar(match[2])
  }

  return data
}

function parseScalar(raw: string): unknown {
  const value = raw.trim()

  if (value === '') {
    return null
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    return value
      .slice(1, -1)
      .split(',')
      .map((item) => parseScalar(item))
      .filter((item) => item !== null)
  }

  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  if (value === 'true') {
    return true
  }

  if (value === 'false') {
    return false
  }

  if (/^-?\d+(?:\.\d+)?$/.test(value)) {
    return Number(value)
  }

  return value.split(/\s+#/)[0].trim()
}
