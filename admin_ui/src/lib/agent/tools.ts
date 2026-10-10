import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type, type TSchema } from '@earendil-works/pi-ai';

import { parseFrontMatter } from '@/lib/front-matter';
import { pagesApi, tagsApi, webApi } from 'ui-sdk';

import type { AgentToolBuildContext, AgentToolDescriptor, AgentToolGroup } from './types';
import { buildUseSkillTool, USE_SKILL_TOOL_ID } from './skill-registry';
import type { EditorMutationBridge, FrontMatterPatch } from './editor-mutations';

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

/**
 * Wrap a tool factory in a registry descriptor. The metadata (id/label/
 * description) is read from a probe build at module load; only the descriptor's
 * `build` ever runs against a real editor.
 */
function defineTool<S extends TSchema>(
  group: AgentToolGroup,
  requiresEditor: boolean,
  factory: (ctx: AgentToolBuildContext) => AgentTool<S>,
): AgentToolDescriptor {
  const probe = factory({});
  return {
    id: probe.name,
    name: probe.name,
    label: probe.label,
    description: probe.description,
    group,
    requiresEditor,
    build: factory as (ctx: AgentToolBuildContext) => AgentTool<any>,
  };
}

export const BUILTIN_TOOLS: AgentToolDescriptor[] = [
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

  defineTool('editor', true, ctx => ({
    name: 'get_content',
    label: 'Get content',
    description:
      "Return the current editor's markdown content (without the frontmatter section). Requires the editor page to be open.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireEditor(ctx.editor);
      const content = ed.getContent();
      return textBlocks(content || '(empty)');
    },
  })),

  defineTool('editor', true, ctx => ({
    name: 'update_content',
    label: 'Update content',
    description:
      'Stage a replacement for the FULL markdown body of the open editor (without the frontmatter section). Only use this when changing the whole document. If the user is revising a selected chunk, use update_selection instead — never update_content. The editor is NOT modified yet — the change is held and shown in the review dialog after you call save, where the user accepts, edits or rejects it.',
    parameters: Type.Object({
      content_md: Type.String({
        description:
          'New FULL markdown body (must NOT include frontmatter --- delimiters). Not a fragment.',
      }),
    }),
    execute: async (_id, args) => {
      const ed = requireEditor(ctx.editor);
      ed.setContent((args as { content_md: string }).content_md);
      return textBlocks('Replaced the content section in the editor (not yet saved).');
    },
  })),

  defineTool('editor', true, ctx => ({
    name: 'get_selection',
    label: 'Get selection',
    description:
      "Return the user's current editor selection as markdown, expanded to whole blocks. Returns 'No selection.' when nothing is selected. Requires the editor page to be open.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireEditor(ctx.editor);
      const selection = ed.getSelection();
      if (selection === null) {
        return textBlocks('No selection.');
      }
      return textBlocks(selection.markdown || '(empty selection)');
    },
  })),

  defineTool('editor', true, ctx => ({
    name: 'update_selection',
    label: 'Update selection',
    description:
      "Stage a replacement for only the user's current editor selection (whole blocks) — the rest of the document is untouched. Always use this (never update_content) when the user's message starts with 'Revise the following selection' or otherwise targets a selected chunk. Pass ONLY the revised markdown for the selection. The editor is NOT modified until the user finishes the review dialog opened by save.",
    parameters: Type.Object({
      content_md: Type.String({
        description:
          'Full revised markdown for the selection (must NOT include frontmatter --- delimiters)',
      }),
    }),
    execute: async (_id, args) => {
      const ed = requireEditor(ctx.editor);
      ed.updateSelection((args as { content_md: string }).content_md);
      return textBlocks('Replaced the selection in the editor (not yet saved).');
    },
  })),

  defineTool('editor', true, ctx => ({
    name: 'get_commit_note',
    label: 'Get commit note',
    description:
      'Return the current value of the editor\'s "Commit Note" field. This text is used as the commit message when the user saves the page. Requires the editor page to be open.',
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireEditor(ctx.editor);
      const note = ed.getCommitNote();
      return textBlocks(note || '(empty)');
    },
  })),

  defineTool('editor', true, ctx => ({
    name: 'set_commit_note',
    label: 'Set commit note',
    description:
      'Set the editor\'s "Commit Note" field. This becomes the commit message recorded when the user saves the page. Keep it short and descriptive (e.g. "Fix typo in intro"). Mutates the editor UI only — the value is persisted when the user clicks Save. Use get_commit_note first to see the current value.',
    parameters: Type.Object({
      commit_note: Type.String({
        description: 'Short commit message used for the next save',
      }),
    }),
    execute: async (_id, args) => {
      const ed = requireEditor(ctx.editor);
      const note = (args as { commit_note: string }).commit_note.trim();
      if (note === '') {
        throw new Error('commit_note cannot be empty.');
      }
      ed.setCommitNote(note);
      return textBlocks(`Set the commit note to: ${note}`);
    },
  })),

  defineTool('editor', true, ctx => ({
    name: 'save',
    label: 'Save draft',
    description:
      "Submit your staged content changes for the user's review. Opens the review dialog where the user decides which changes to keep; the editor is only updated after they finish the review, and nothing is persisted to the server (the user saves afterwards). Call this once after you finish editing.",
    parameters: Type.Object({}),
    execute: async () => {
      const ed = requireEditor(ctx.editor);
      ed.openReview();
      return textBlocks(
        'Changes submitted for review. The user will review the diff and save. You can consider this task complete.',
      );
    },
  })),

  {
    id: USE_SKILL_TOOL_ID,
    name: USE_SKILL_TOOL_ID,
    label: 'Use skill',
    description:
      'Load the full instructions for one of the available skills by its exact name. Call this when a task matches a skill description, then follow the returned instructions.',
    group: 'skills',
    requiresEditor: false,
    build: () => buildUseSkillTool() as AgentTool<any>,
  },
];

export interface BuildAgentToolsOptions {
  editor?: EditorMutationBridge;
  extraTools?: AgentTool<any>[];
  disabledIds?: string[];
}

/** Build the enabled tool instances from a descriptor list. */
export function buildToolsFromDescriptors(
  descriptors: AgentToolDescriptor[],
  options: BuildAgentToolsOptions = {},
): AgentTool<any>[] {
  const { editor, disabledIds = [] } = options;
  const disabled = new Set(disabledIds);
  const out: AgentTool<any>[] = [];
  for (const descriptor of descriptors) {
    if (disabled.has(descriptor.id)) {
      continue;
    }
    if (descriptor.requiresEditor === true && editor === undefined) {
      continue;
    }
    out.push(descriptor.build({ editor }));
  }
  return out;
}

/** The built-in tool set (registry + skills) plus any app-injected tools. */
export function buildAgentTools(options: BuildAgentToolsOptions = {}): AgentTool<any>[] {
  const { extraTools = [], ...rest } = options;
  return [...buildToolsFromDescriptors(BUILTIN_TOOLS, rest), ...extraTools];
}
