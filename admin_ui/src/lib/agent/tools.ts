import { Type, type TSchema } from '@earendil-works/pi-ai';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { parseFrontMatter } from '@/lib/front-matter';
import { pagesApi, tagsApi } from 'ui-sdk';
import type { EditorMutationBridge, FrontMatterPatch } from './editor-mutations';

const MAX_FETCH_CHARS = 12000;

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

function tool<S extends TSchema>(t: AgentTool<S>): AgentTool<S> {
  return t;
}

function requireEditor(editor: EditorMutationBridge | undefined): EditorMutationBridge {
  if (editor === undefined) {
    throw new Error('No editor is open — this tool requires the editor page.');
  }
  return editor;
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

  const getFrontmatter = tool({
    name: 'get_frontmatter',
    label: 'Get frontmatter',
    description:
      "Return the current editor's frontmatter as a YAML string (without --- delimiters). Includes title, slug, date, tags, extra fields, and SEO fields. Requires the editor page to be open.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireEditor(editor);
      return textBlocks(ed.getFrontMatterYaml());
    },
  });

  const updateFrontmatter = tool({
    name: 'update_frontmatter',
    label: 'Update frontmatter',
    description:
      "Replace the open editor's frontmatter with the given YAML string (without --- delimiters). Parses standard fields (title, slug, date, tags) and extra fields. Mutates the editor UI only — the user still clicks Save to persist. Use get_frontmatter first to see current values.",
    parameters: Type.Object({
      frontmatter_yaml: Type.String({
        description:
          'Full frontmatter as YAML lines (no --- delimiters). Example:\ntitle: "Hello World"\nslug: hello-world\ntags: [intro, draft]',
      }),
    }),
    execute: async (_id, args) => {
      const ed = requireEditor(editor);
      const yaml = args.frontmatter_yaml.trim();
      if (yaml === '') {
        throw new Error('frontmatter_yaml cannot be empty.');
      }

      const { data } = parseFrontMatter(`---\n${yaml}\n---\n`);
      const patch: FrontMatterPatch = {};

      if (typeof data.title === 'string') {
        patch.title = data.title;
      }
      if (typeof data.slug === 'string') {
        patch.slug = data.slug;
      }
      if (typeof data.date === 'string') {
        patch.date = data.date;
      }
      if (Array.isArray(data.tags)) {
        patch.tags = data.tags.map(String);
      }

      const current = ed.getFrontMatter();
      const extra: Array<{ key: string; value: string }> = [];
      const reserved = new Set([
        'title',
        'slug',
        'date',
        'tags',
        'seo_title',
        'description',
        'keywords',
        'og_image',
        'canonical',
        'noindex',
      ]);
      for (const [key, value] of Object.entries(data)) {
        if (reserved.has(key)) {
          continue;
        }
        extra.push({ key, value: String(value ?? '') });
      }
      if (extra.length > 0) {
        patch.extra = extra;
      }

      const seo: Record<string, unknown> = {};
      for (const key of ['seo_title', 'description', 'keywords', 'og_image', 'canonical']) {
        if (typeof data[key] === 'string') {
          seo[key] = data[key];
        }
      }
      if (data.noindex !== undefined) {
        seo.noindex = Boolean(data.noindex);
      }
      if (Object.keys(seo).length > 0) {
        patch.seo = { ...current.seo, ...seo };
      }

      ed.setFrontMatter(patch);
      const next = ed.getFrontMatter();
      return textBlocks(
        `Updated frontmatter in the editor (not yet saved):\n` +
          `- title: ${next.title}\n- slug: ${next.slug}\n- date: ${next.date || '—'}\n` +
          `- tags: ${next.tags.join(', ') || 'none'}${
            next.extra.length > 0
              ? `\n- extra: ${next.extra.map(f => `${f.key}=${f.value}`).join(', ')}`
              : ''
          }`,
      );
    },
  });

  const getContent = tool({
    name: 'get_content',
    label: 'Get content',
    description:
      "Return the current editor's markdown content (without the frontmatter section). Requires the editor page to be open.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireEditor(editor);
      const content = ed.getContent();
      return textBlocks(content || '(empty)');
    },
  });

  const updateContent = tool({
    name: 'update_content',
    label: 'Update content',
    description:
      "Replace the open editor's markdown content (without the frontmatter section). Mutates the editor UI only — the user still clicks Save to persist. The editor's WYSIWYG view reflects this immediately.",
    parameters: Type.Object({
      content_md: Type.String({
        description: 'New markdown body (must NOT include frontmatter --- delimiters)',
      }),
    }),
    execute: async (_id, args) => {
      const ed = requireEditor(editor);
      ed.setContent(args.content_md);
      return textBlocks('Replaced the content section in the editor (not yet saved).');
    },
  });

  return [
    searchContent,
    listTags,
    fetchUrl,
    getFrontmatter,
    updateFrontmatter,
    getContent,
    updateContent,
  ] as unknown as AgentTool<any>[];
}
