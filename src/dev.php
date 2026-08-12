/**
 * ------------------------------------------------------------
 * Dev-only module
 *
 *   ?module=dev&action=initData    POST  seed the demo article
 *
 * This fragment is included ONLY in dev builds (php build.php).
 * rel.sh / "php build.php release" excludes it, and the router
 * region that dispatches module=dev is stripped at the same time,
 * so the release artifact contains no trace of the endpoint.
 *
 * initData requires an authenticated admin and seeds (or refreshes)
 * the demo page that exercises every markdown feature the frontend
 * supports: image sizing/positioning, KaTeX math, Mermaid diagrams,
 * GFM tables and code blocks. The page is created "in the name of"
 * the calling admin.
 * ------------------------------------------------------------
 */

const DEMO_PAGE = [
    'slug' => 'hello-single-php-blog',
    'title' => 'Hello, single-file blog',
    'status' => 'published',
    'content_md' => <<<'MD'
---
title: "Hello, single-file blog"
date: 2026-08-10
author: "Administrator"
tags: [announcement, architecture]
cover: "https://picsum.photos/id/1039/1200/630"
published: true
---

Welcome to the new blog. Every page here is served from a single `index.php` file, yet the writing experience is full-featured: GFM tables, KaTeX math, Mermaid diagrams, and flexible image sizing and positioning.

## Flexible images

Images accept Obsidian-style directives in the alt text, separated by pipes:

| Directive        | Effect                          |
| ---------------- | ------------------------------- |
| `|640`           | width 640px, height auto        |
| `|400x240`       | width 400px, height 240px       |
| `|center`        | centered block image            |
| `|float-left`    | float left, text wraps around   |
| `|float-right`   | float right, text wraps around  |

A plain sized image:

![Writing notes|720](https://picsum.photos/id/1015/900/600)

A floated one, with a caption:

![The team|float-right|260](https://picsum.photos/id/1039/520/390)

Paragraphs flow around floated figures so you can keep the narrative going while a portrait sits to one side. Floats pair nicely with a fixed pixel width, and on small screens the float naturally drops back into normal flow.

## Math, inline and displayed

Inline math like $x^2 + y^2 = z^2$ renders with KaTeX, as do display equations:

$$
\sum_{n=1}^{\infty} \frac{1}{n^2} = \frac{\pi^2}{6}
$$

## Diagrams with Mermaid

Fenced `mermaid` code blocks become interactive-ish SVG diagrams, themed to match light and dark mode:

```mermaid
flowchart LR
    A[Markdown] --> B[remark plugins]
    B --> C[Math + images]
    B --> D[Mermaid]
    C --> E[HTML]
    D --> E
```

## Code blocks

```ts
function pick<T>(items: T[], n: number): T[] {
  return [...items].sort(() => Math.random() - 0.5).slice(0, n)
}
```

## Getting started

Drop `dist/index.php` on any static host. That's it — no database, no build step on the server. Writing is just markdown.
MD,
];

/**
 * Seed (or refresh) the demo page in the name of the authenticated
 * admin. Every hit overwrites the page in place (id, content, cover,
 * status, and authorship all reset), so the demo data is always an
 * exact copy of DEMO_PAGE. Works over GET or POST (dev convenience).
 */
function handle_dev(string $action, string $method): never
{
    switch ($action) {
        case 'initData':
            if (!in_array($method, ['GET', 'POST'], true)) {
                json_response(['error' => 'Method not allowed'], 405);
            }

            $user = require_auth();

            if (!is_admin($user)) {
                json_response(['error' => 'forbidden', 'permission' => 'admin'], 403);
            }

            $stmt = db()->prepare('SELECT id FROM pages WHERE slug = ?');
            $stmt->execute([DEMO_PAGE['slug']]);
            $existing = $stmt->fetchColumn();

            if ($existing === false) {
                $stmt = db()->prepare(
                    'INSERT INTO pages (slug, title, content_md, status, created_by, updated_by)
                     VALUES (?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([
                    DEMO_PAGE['slug'],
                    DEMO_PAGE['title'],
                    DEMO_PAGE['content_md'],
                    DEMO_PAGE['status'],
                    $user['id'],
                    $user['id'],
                ]);
                $id = (int) db()->lastInsertId();
            } else {
                $id = (int) $existing;
                $stmt = db()->prepare(
                    'UPDATE pages SET title = ?, content_md = ?, status = ?,
                            created_by = ?, updated_by = ?, updated_at = datetime(\'now\')
                      WHERE id = ?'
                );
                $stmt->execute([
                    DEMO_PAGE['title'],
                    DEMO_PAGE['content_md'],
                    DEMO_PAGE['status'],
                    $user['id'],
                    $user['id'],
                    $id,
                ]);
            }

            json_response(['page' => page_payload(fetch_page($id))]);

        default:
            json_response(['error' => 'Unknown dev action'], 404);
    }
}
