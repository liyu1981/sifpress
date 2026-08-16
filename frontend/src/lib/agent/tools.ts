import { Type, type TSchema } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { pagesApi, tagsApi, type PageStatus } from '@/lib/pages';
import type { EditorMutationBridge, FrontMatterPatch } from './editor-mutations';

const MAX_FETCH_CHARS = 12000;
const MAX_OUTPUT_CHARS = 12000;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated]`;
}

async function fetchPageText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { Accept: 'text/html,text/plain,*/*' } });
  if (!response.ok) {
    throw new Error(`fetch_url: HTTP ${response.status} for ${url}`);
  }
  const contentType = response.headers.get('content-type') ?? '';
  const body = await response.text();
  if (contentType.includes('text/plain') || !contentType.includes('html')) {
    return truncate(body, MAX_FETCH_CHARS);
  }
  const doc = new DOMParser().parseFromString(body, 'text/html');
  doc
    .querySelectorAll('script,style,noscript,svg,iframe,header,footer,nav')
    .forEach(el => el.remove());
  const title = doc.querySelector('title')?.textContent?.trim() ?? '';
  const text = (doc.body?.textContent ?? '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return truncate(`${title !== '' ? `# ${title}\n\n` : ''}${text}`, MAX_FETCH_CHARS);
}

function textBlocks(...texts: string[]) {
  return {
    content: texts.filter(t => t !== '').map(text => ({ type: 'text' as const, text })),
    details: {},
  };
}

function pageSummaryLine(item: {
  id: number;
  slug: string;
  title: string;
  status: PageStatus;
  updated_at: string;
}): string {
  return `- [${item.id}] "${item.title}" (slug: ${item.slug}, ${item.status}, updated ${item.updated_at})`;
}

function tool<S extends TSchema>(t: AgentTool<S>): AgentTool<S> {
  return t;
}

export function buildAgentTools(editor?: EditorMutationBridge): AgentTool<any>[] {
  const searchContent = tool({
    name: 'search_content',
    label: 'Search content',
    description:
      "Full-text search across the user's local pages. Returns matching pages with their slug, title, and excerpt. Use the user's query terms or a distinctive phrase.",
    parameters: Type.Object({
      q: Type.String({ description: 'Search query (supports substrings, also for CJK)' }),
    }),
    execute: async (_id, args) => {
      const result = await pagesApi.search(args.q);
      if (result.items.length === 0) {
        return textBlocks(`No pages matched.`);
      }
      return textBlocks(
        `Found ${result.items.length} matching page(s):`,
        result.items
          .map(
            p =>
              `- "${p.title}" (slug: ${p.slug}, ${p.status}, updated ${p.updated_at})\n  Excerpt: ${truncate(p.excerpt, 200)}`,
          )
          .join('\n'),
      );
    },
  });

  const readPage = tool({
    name: 'read_page',
    label: 'Read page',
    description:
      "Read a page's full content by its slug or id. Returns the page's title, status, tags, author, and full markdown body.",
    parameters: Type.Object({
      slug: Type.Optional(Type.String({ description: 'Page slug' })),
      id: Type.Optional(Type.Number({ description: 'Page id' })),
    }),
    execute: async (_id, args) => {
      if (args.slug === undefined && args.id === undefined) {
        throw new Error('read_page requires either slug or id');
      }
      const page = await pagesApi.get(
        args.id !== undefined ? { id: args.id } : { slug: args.slug },
      );
      return textBlocks(
        `# ${page.title}\nslug: ${page.slug} · status: ${page.status} · tags: ${page.tags.join(', ') || 'none'} · by ${page.created_by_name}`,
        truncate(page.content_md, MAX_OUTPUT_CHARS),
      );
    },
  });

  const listPages = tool({
    name: 'list_pages',
    label: 'List pages',
    description:
      "List the user's pages (optionally filtered by status or tag). Returns ids, titles, slugs, and statuses.",
    parameters: Type.Object({
      status: Type.Optional(Type.String({ description: 'Filter by status: draft or published' })),
      tag: Type.Optional(Type.String({ description: 'Filter by tag' })),
    }),
    execute: async (_id, args) => {
      const status =
        args.status === 'draft' || args.status === 'published' ? args.status : undefined;
      const result = await pagesApi.list({ status, tag: args.tag, per_page: 50 });
      if (result.items.length === 0) {
        return textBlocks('No pages found.');
      }
      return textBlocks(`Total: ${result.total}.`, result.items.map(pageSummaryLine).join('\n'));
    },
  });

  const listTags = tool({
    name: 'list_tags',
    label: 'List tags',
    description: 'List all tags in use and how many pages each has.',
    parameters: Type.Object({}),
    execute: async () => {
      const tags = await tagsApi.list();
      if (tags.length === 0) {
        return textBlocks('No tags yet.');
      }
      return textBlocks(tags.map(t => `- ${t.name} (${t.count})`).join('\n'));
    },
  });

  const fetchUrl = tool({
    name: 'fetch_url',
    label: 'Fetch URL',
    description:
      'Fetch a web page and return its text content. Works only for sites that allow browser cross-origin requests (CORS). Best-effort.',
    parameters: Type.Object({
      url: Type.String({ description: 'Absolute http(s) URL to fetch' }),
    }),
    execute: async (_id, args) => {
      const text = await fetchPageText(args.url);
      return textBlocks(text);
    },
  });

  const updateFrontMatter = tool({
    name: 'update_frontmatter',
    label: 'Update frontmatter',
    description:
      "Update the open editor's frontmatter section fields: title, slug, date, tags, and any extra fields. Mutates the editor UI only — the user still clicks Save to persist. Read read_page or the draft to see current values first.",
    parameters: Type.Object({
      title: Type.Optional(Type.String({ description: 'New title' })),
      slug: Type.Optional(Type.String({ description: 'New slug' })),
      date: Type.Optional(Type.String({ description: 'New date (YYYY-MM-DD)' })),
      tags: Type.Optional(
        Type.Array(Type.String({ description: 'New tags' }), {
          description: 'Replace the full tags list',
        }),
      ),
      extra: Type.Optional(
        Type.Array(
          Type.Object({
            key: Type.String({ description: 'Extra field key (e.g. cover)' }),
            value: Type.String({ description: 'Extra field value' }),
          }),
          { description: 'Replace the full extra-fields list' },
        ),
      ),
    }),
    execute: async (_id, args) => {
      if (editor === undefined) {
        throw new Error('No editor is open — update_frontmatter requires the editor page.');
      }
      const current = editor.getFrontMatter();
      const patch: FrontMatterPatch = {};
      if (args.title !== undefined) {
        patch.title = args.title;
      }
      if (args.slug !== undefined) {
        patch.slug = args.slug;
      }
      if (args.date !== undefined) {
        patch.date = args.date;
      }
      if (args.tags !== undefined) {
        patch.tags = args.tags;
      }
      if (args.extra !== undefined) {
        patch.extra = args.extra;
      }
      editor.setFrontMatter(patch);
      const next = editor.getFrontMatter();
      const lines = [
        `Updated frontmatter in the editor (not yet saved):\n- title: ${next.title}\n- slug: ${next.slug}\n- date: ${next.date || '—'}\n- tags: ${next.tags.join(', ') || 'none'}${
          next.extra.length > 0
            ? `\n- extra: ${next.extra.map(f => `${f.key}=${f.value}`).join(', ')}`
            : ''
        }`,
      ];
      if (current.title !== next.title || current.slug !== next.slug) {
        lines.push(`Previous: title "${current.title}", slug "${current.slug}".`);
      }
      return textBlocks(...lines);
    },
  });

  const setContent = tool({
    name: 'set_content',
    label: 'Set content',
    description:
      "Replace the open editor's content section (the markdown body) with the given markdown. Mutates the editor UI only — the user still clicks Save to persist. The editor's WYSIWYG view reflects this immediately.",
    parameters: Type.Object({
      content_md: Type.String({ description: 'New full markdown body for the content section' }),
    }),
    execute: async (_id, args) => {
      if (editor === undefined) {
        throw new Error('No editor is open — set_content requires the editor page.');
      }
      editor.setContent(args.content_md);
      return textBlocks('Replaced the content section in the editor (not yet saved).');
    },
  });

  return [
    searchContent,
    readPage,
    listPages,
    listTags,
    fetchUrl,
    updateFrontMatter,
    setContent,
  ] as unknown as AgentTool<any>[];
}
