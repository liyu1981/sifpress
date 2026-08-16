import { Type, type TSchema } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { pagesApi, tagsApi, type PageStatus } from '@/lib/pages';
import { requestConfirm } from './confirm';

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

export function buildAgentTools(): AgentTool<any>[] {
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

  const createPage = tool({
    name: 'create_page',
    label: 'Create page',
    description:
      "Create a new page in the user's blog with the given title, slug, markdown body, and status. Requires the user to confirm the action first. Use the full markdown body as the final content.",
    parameters: Type.Object({
      slug: Type.String({ description: 'URL slug (lowercase letters, digits, hyphens)' }),
      title: Type.String({ description: 'Page title' }),
      content_md: Type.String({ description: 'Full markdown body' }),
      status: Type.String({ description: 'draft or published' }),
    }),
    executionMode: 'sequential',
    execute: async (_id, args) => {
      const status: PageStatus = args.status === 'published' ? 'published' : 'draft';
      const confirmed = await requestConfirm(
        'create',
        `Create page "${args.title}" (${status})`,
        truncate(args.content_md, 2000),
      );
      if (!confirmed) {
        throw new Error('User declined to create the page.');
      }
      const page = await pagesApi.create({
        slug: args.slug,
        title: args.title,
        content_md: args.content_md,
        status,
      });
      return textBlocks(
        `Created page #${page.id} "${page.title}" at slug /${page.slug} (${page.status}).`,
      );
    },
  });

  const updatePage = tool({
    name: 'update_page',
    label: 'Update page',
    description:
      "Update an existing page's title, slug, markdown body, and/or status by id or slug. Requires the user to confirm the action first. Prefer read_page first to see the current content.",
    parameters: Type.Object({
      id: Type.Optional(Type.Number({ description: 'Page id (either id or slug is required)' })),
      slug: Type.Optional(
        Type.String({ description: 'Page slug (either id or slug is required)' }),
      ),
      title: Type.Optional(Type.String({ description: 'New title' })),
      content_md: Type.Optional(Type.String({ description: 'New full markdown body' })),
      status: Type.Optional(Type.String({ description: 'New status: draft or published' })),
    }),
    executionMode: 'sequential',
    execute: async (_id, args) => {
      if (args.id === undefined && args.slug === undefined) {
        throw new Error('update_page requires either id or slug');
      }
      const pageId = args.id ?? (await pagesApi.get({ slug: args.slug })).id;
      const confirmed = await requestConfirm(
        'update',
        `Update page #${pageId}${args.title !== undefined ? ` → "${args.title}"` : ''}`,
        args.content_md !== undefined
          ? truncate(args.content_md, 2000)
          : 'Update metadata only (title/status).',
      );
      if (!confirmed) {
        throw new Error('User declined to update the page.');
      }
      const status =
        args.status === 'published' || args.status === 'draft' ? args.status : undefined;
      const page = await pagesApi.update({
        id: pageId,
        ...(args.title !== undefined ? { title: args.title } : {}),
        ...(args.content_md !== undefined ? { content_md: args.content_md } : {}),
        ...(status !== undefined ? { status } : {}),
      });
      return textBlocks(`Updated page #${page.id} "${page.title}" (${page.status}).`);
    },
  });

  return [
    searchContent,
    readPage,
    listPages,
    listTags,
    fetchUrl,
    createPage,
    updatePage,
  ] as unknown as AgentTool<any>[];
}
