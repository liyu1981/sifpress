/**
 * Shared markdown-demo page, available in BOTH dev and release builds.
 *
 * The content is the living reference for every markdown feature the
 * frontend supports. Two consumers reuse it:
 *
 *   - `?module=dev&action=initData` (dev.php) seeds it into the database
 *     as a real, editable page named after the calling admin.
 *   - `api_pages_get` (api.php) serves it as a *virtual* page whenever the
 *     reserved slug is requested and no real page occupies it, so the
 *     release artifact can show the demo without any DB row. The home
 *     page falls back to it when the database has no articles.
 *
 * The slug is deliberately obscure so it is unlikely to collide with a
 * user-created page.
 */

const DEMO_PAGE_SLUG = 'sifpress-markdown-syntax';
const DEMO_PAGE_TITLE = 'Hello, Sifpress';
const DEMO_PAGE_DATE = '2026-08-14';

const DEMO_PAGE_CONTENT = <<<'MD'
---
title: "Hello, Sifpress"
slug: "sifpress-markdown-syntax"
date: 2026-08-14
author: "Administrator"
tags: [markdown, syntax, demo]
cover: "https://picsum.photos/id/1039/1200/630"
---

Welcome! This page is a living reference for every Markdown feature this blog understands. For each section, the **syntax** is shown first in a code block, and the **rendered result** follows right below.

## Headings

ATX headings use 1 to 6 `#` signs; Setext headings underline a line with `===` or `---`.

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
```

# Heading 1

## Heading 2

### Heading 3

#### Heading 4

## Emphasis

```markdown
**bold**  *italic*  ***bold italic***  ~~strikethrough~~  `inline code`
```

**bold**, *italic*, ***bold italic***, ~~strikethrough~~, and `inline code`.

## Links

External links open in a new tab. The `|link` directive turns any image/video URL into a plain link instead of an embed.

```markdown
[external link](https://example.com)
![YouTube as a plain link|link](https://www.youtube.com/watch?v=M7lc1UVf-VE)
```

[external link](https://example.com)

![YouTube as a plain link|link](https://www.youtube.com/watch?v=M7lc1UVf-VE)

## Images

Images accept Obsidian-style directives in the alt text, separated by pipes:

| Directive        | Effect                         |
| ---------------- | ------------------------------ |
| `|640`           | width 640px, height auto       |
| `|400x240`       | width 400px, height 240px      |
| `|center`        | centered block image           |
| `|float-left`    | float left, text wraps around  |
| `|float-right`   | float right, text wraps around |

```markdown
![plain](https://picsum.photos/id/1015/900/600)
![sized|640](https://picsum.photos/id/1015/900/600)
![centered|center|480](https://picsum.photos/id/1039/520/390)
```

![plain](https://picsum.photos/id/1015/900/600)

![sized|640](https://picsum.photos/id/1015/900/600)

![centered|center|480](https://picsum.photos/id/1039/520/390)

## Videos

Any `![alt](url)` whose URL is a video file, a YouTube link, or a Bilibili link renders as an embedded player instead of an image.

```markdown
![direct video file](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4)
![YouTube](https://www.youtube.com/watch?v=M7lc1UVf-VE)
![Bilibili](https://www.bilibili.com/video/BV1us41137Fd)
```

![direct video file](https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4)

![YouTube](https://www.youtube.com/watch?v=M7lc1UVf-VE)

![Bilibili](https://www.bilibili.com/video/BV1us41137Fd)

## Lists

```markdown
- bullet item
1. ordered item
- [x] completed task
- [ ] pending task
```

- bullet item
1. ordered item
- [x] completed task
- [ ] pending task

## Blockquotes

```markdown
> quoted line
> second line
```

> quoted line
> second line

## Tables

```markdown
| Feature     | Support |
| ----------- | ------- |
| GFM tables  | ✅      |
| task lists  | ✅      |
| strikethrough | ✅    |
```

| Feature     | Support |
| ----------- | ------- |
| GFM tables  | ✅      |
| task lists  | ✅      |
| strikethrough | ✅    |

## Code blocks

Fenced code blocks get language-aware syntax highlighting.

````markdown
```ts
function add(a: number, b: number): number {
  return a + b
}
```
````

```ts
function add(a: number, b: number): number {
  return a + b
}
```

## Math

Inline math is wrapped in single `$…$`, display math in double `$$…$$`.

```markdown
Inline math: $x^2 + y^2 = z^2$

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$
```

Inline math: $x^2 + y^2 = z^2$

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

## Mermaid diagrams

Fenced `mermaid` code blocks become SVG diagrams, themed to match light and dark mode.

````markdown
```mermaid
flowchart LR
    A[Markdown] --> B[remark plugins]
    B --> C[Math + images]
    B --> D[Mermaid]
    C --> E[HTML]
    D --> E
```
````

```mermaid
flowchart LR
    A[Markdown] --> B[remark plugins]
    B --> C[Math + images]
    B --> D[Mermaid]
    C --> E[HTML]
    D --> E
```

## Horizontal rules

```markdown
---
```

---

## Autolinks

```markdown
<https://example.com>
```

<https://example.com>

MD;

/**
 * page_payload-shaped virtual page for the demo. can_edit is always false
 * and the id is 0 (never collides with a real page id), so the demo is
 * read-only everywhere it is served from the artifact.
 */
function demo_page_payload(): array
{
    return [
        'id' => 0,
        'slug' => DEMO_PAGE_SLUG,
        'title' => DEMO_PAGE_TITLE,
        'content_md' => DEMO_PAGE_CONTENT,
        'tags' => front_matter_tags(DEMO_PAGE_CONTENT),
        'status' => 'published',
        'created_by' => null,
        'created_by_name' => 'Sifpress',
        'updated_by' => null,
        'updated_by_name' => 'Sifpress',
        'created_at' => DEMO_PAGE_DATE . ' 00:00:00',
        'updated_at' => DEMO_PAGE_DATE . ' 00:00:00',
        'can_edit' => false,
    ];
}
