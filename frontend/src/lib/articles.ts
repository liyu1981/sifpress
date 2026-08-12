export interface ArticleMeta {
  slug: string
  title: string
  date: string
  tags: string[]
  excerpt: string
  cover: string
}

export interface Article extends ArticleMeta {
  content: string
}

export const NEWEST_SLUG = 'hello-single-php-blog'

const articles: Article[] = [
  {
    slug: NEWEST_SLUG,
    title: 'Hello, single-file blog',
    date: '2026-08-10',
    tags: ['announcement', 'architecture'],
    excerpt:
      'A markdown-powered blog that ships as one index.php — no server setup, no rewrite rules. Includes math, diagrams, and flexible images.',
    cover: 'https://picsum.photos/id/1039/1200/630',
    content: `Welcome to the new blog. Every page here is served from a single \`index.php\` file, yet the writing experience is full-featured: GFM tables, KaTeX math, Mermaid diagrams, and flexible image sizing and positioning.

## Flexible images

Images accept Obsidian-style directives in the alt text, separated by pipes:

| Directive        | Effect                          |
| ---------------- | ------------------------------- |
| \`|640\`           | width 640px, height auto        |
| \`|400x240\`       | width 400px, height 240px       |
| \`|center\`        | centered block image            |
| \`|float-left\`    | float left, text wraps around   |
| \`|float-right\`   | float right, text wraps around  |

A plain sized image:

![Writing notes|720](https://picsum.photos/id/1015/900/600)

A floated one, with a caption:

![The team|float-right|260](https://picsum.photos/id/1039/520/390)

Paragraphs flow around floated figures so you can keep the narrative going while a portrait sits to one side. Floats pair nicely with a fixed pixel width, and on small screens the float naturally drops back into normal flow.

## Math, inline and displayed

Inline math like $x^2 + y^2 = z^2$ renders with KaTeX, as do display equations:

$$
\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}
$$

## Diagrams with Mermaid

Fenced \`mermaid\` code blocks become interactive-ish SVG diagrams, themed to match light and dark mode:

\`\`\`mermaid
flowchart LR
    A[Markdown] --> B[remark plugins]
    B --> C[Math + images]
    B --> D[Mermaid]
    C --> E[HTML]
    D --> E
\`\`\`

## Code blocks

\`\`\`ts
function pick<T>(items: T[], n: number): T[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, n)
}
\`\`\`

## Getting started

Drop \`dist/index.php\` on any static host. That's it — no database, no build step on the server. Writing is just markdown.
`,
  },
  {
    slug: 'math-rendering',
    title: 'Math rendering with KaTeX',
    date: '2026-08-02',
    tags: ['math', 'katex'],
    excerpt:
      'Inline $…$ and block $$…$$ equations render client-side with KaTeX — fast, no MathJax weight. A short tour with a sequence diagram.',
    cover: 'https://picsum.photos/id/110/1200/630',
    content: `KaTeX renders \`$…$\` and \`$$…$$\` at display speed with no server round-trip.

## The quadratic formula

$$
x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}
$$

## An identity worth knowing

Euler's identity: $e^{i\\pi} + 1 = 0$.

## A Markov chain, in prose

A simple two-state system has transition matrix

$$
P = \\begin{pmatrix} 0.9 & 0.1 \\\\ 0.2 & 0.8 \\end{pmatrix}
$$

and after $n$ steps the state distribution is $\\pi^{(n)} = \\pi^{(0)} P^n$.

![The proof|center|520](https://picsum.photos/id/48/640/426)

## How rendering flows

\`\`\`mermaid
sequenceDiagram
    participant U as User
    participant R as remark-math
    participant K as rehype-katex
    U->>R: $E=mc^2$
    R->>K: math node
    K->>K: KaTeX (client)
    K-->>U: rendered equation
\`\`\`

Escape literal dollar signs with a backslash: \\$5 feels expensive.
`,
  },
  {
    slug: 'writing-markdown',
    title: 'Writing markdown for this blog',
    date: '2026-07-25',
    tags: ['markdown', 'reference'],
    excerpt:
      'Every extension in one place: image sizing and position, math, Mermaid, GFM tables, task lists, and code highlighting.',
    cover: 'https://picsum.photos/id/180/1200/630',
    content: `A cheat sheet for the extensions this blog understands.

## Image sizes

![Wide header|800](https://picsum.photos/id/1019/1200/400)

![Square thumbnail|120](https://picsum.photos/id/237/300/300)

## Image position

A centered image:

![Centered|center|560](https://picsum.photos/id/1040/720/480)

A left-floated image wraps text to its right:

![Float left|float-left|240](https://picsum.photos/id/1074/480/480)

Standalone images become figures — the alt text doubles as the caption, as above. Inline images inside a paragraph, like ![inline|28](https://picsum.photos/id/451/64/64), stay inline.

## GFM tables and task lists

| Language | Rendered | Notes |
| -------- | :------: | ----- |
| GFM      |    ✓     | tables, strikethrough, autolinks |
| KaTeX    |    ✓     | inline and block math |
| Mermaid  |    ✓     | fenced code blocks |

- [x] Write the post
- [x] Show every extension
- [ ] Ship the real backend

## A Gantt chart

\`\`\`mermaid
gantt
    title Release plan
    dateFormat YYYY-MM-DD
    section Frontend
    Markdown pipeline  :a1, 2026-07-20, 5d
    Article pages      :a2, after a1, 4d
    section Backend
    Content API        :b1, 2026-07-28, 6d
\`\`\`
`,
  },
]

export function fetchArticles(): Promise<ArticleMeta[]> {
  return Promise.resolve(
    [...articles]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map(({ content: _, ...meta }) => meta),
  )
}

export function fetchArticle(slug: string): Promise<Article | null> {
  const article =
    slug === 'latest' ? articles[0] : articles.find((a) => a.slug === slug)

  return Promise.resolve(article ?? null)
}

export function fetchLatestArticle(): Promise<Article | null> {
  return fetchArticle('latest')
}
