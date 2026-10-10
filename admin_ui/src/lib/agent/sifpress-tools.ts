import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type, type TSchema } from '@earendil-works/pi-ai';
import type {
  AgentToolBuildContext,
  AgentToolDescriptor,
  EditorMutationBridge,
  FrontMatterPatch,
} from '@sifpress/reagent';

import { parseFrontMatter } from '@/lib/front-matter';
import { pagesApi, tagsApi, webApi } from 'ui-sdk';

const MAX_FETCH_CHARS = 12000;

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n…[truncated]`;
}

function textBlocks(...texts: string[]) {
  return {
    content: texts.filter(t => t !== '').map(text => ({ type: 'text' as const, text })),
    details: {},
  };
}

function requireEditor(editor: EditorMutationBridge | undefined): EditorMutationBridge {
  if (editor === undefined) {
    throw new Error('No editor is open — this tool requires the editor page.');
  }
  return editor;
}

function defineTool<S extends TSchema>(
  group: AgentToolDescriptor['group'],
  requiresEditor: boolean,
  build: (ctx: AgentToolBuildContext) => AgentTool<S>,
): AgentToolDescriptor {
  const probe = build({});
  return {
    id: probe.name,
    name: probe.name,
    label: probe.label,
    description: probe.description,
    group,
    requiresEditor,
    build: build as (ctx: AgentToolBuildContext) => AgentTool<any>,
  };
}

/**
 * Sifpress-specific tools injected into ReAgent: everything that talks to the
 * Sifpress JSON API or parses the app's front matter.
 */
export const SIFPRESS_TOOLS: AgentToolDescriptor[] = [
  defineTool('content', false, () => ({
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
        return textBlocks('No pages matched.');
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
  })),

  defineTool('content', false, () => ({
    name: 'list_tags',
    label: 'List tags',
    description: 'List all tags in use and how many pages each has.',
    parameters: Type.Object({}),
    execute: async () => {
      const tags = await tagsApi.list({ include_hidden: true });
      if (tags.length === 0) {
        return textBlocks('No tags yet.');
      }
      return textBlocks(tags.map(t => `- ${t.name} (${t.count})`).join('\n'));
    },
  })),

  defineTool('web', false, () => ({
    name: 'web_fetch',
    label: 'Web fetch',
    description:
      'Fetch a web page and return its main content as markdown. Runs on the server through markdown.new, so it works for arbitrary sites and is not limited by browser CORS. Use this to read documentation, articles, or any external link the user references.',
    parameters: Type.Object({
      url: Type.String({ description: 'Absolute http(s) URL to fetch' }),
    }),
    execute: async (_id, args) => {
      const { content } = await webApi.fetch(args.url, navigator.userAgent);
      return textBlocks(truncate(content, MAX_FETCH_CHARS));
    },
  })),

  defineTool('editor', true, ctx => ({
    name: 'get_frontmatter',
    label: 'Get frontmatter',
    description:
      "Return the current editor's frontmatter as a YAML string (without --- delimiters). Includes title, slug, date, tags, extra fields, and SEO fields. Requires the editor page to be open.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireEditor(ctx.editor);
      return textBlocks(ed.getFrontMatterYaml());
    },
  })),

  defineTool('editor', true, ctx => ({
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
      const ed = requireEditor(ctx.editor);
      const yaml = (args as { frontmatter_yaml: string }).frontmatter_yaml.trim();
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
  })),
];
