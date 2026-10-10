import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';

import { getAgentConfig } from './config';
import type { AgentConfig, AgentSkillDefinition } from './types';

/**
 * Skill registry for the agent: a small built-in set (code-defined, toggleable)
 * merged with the user's custom, browser-stored skills. Only the enabled ones
 * are advertised in the system prompt; full bodies load on demand through the
 * `use_skill` tool.
 */

export const USE_SKILL_TOOL_ID = 'use_skill';

export const BUILTIN_SKILLS: AgentSkillDefinition[] = [
  {
    id: 'seo-review',
    name: 'SEO review',
    description:
      'Use when the user asks to improve a page for search engines or review its SEO metadata.',
    content: `# SEO review

Review the page and improve:
- **Title / seo_title**: 50–60 characters, front-load the primary keyword, no clickbait.
- **Description**: 140–160 characters, one clear value proposition, include the keyword naturally.
- **Slug**: short, lowercase, hyphenated, no stop words if avoidable.
- **Headings**: one H1, a logical H2/H3 outline that covers related queries.
- **Links**: at least one internal link to a related page; descriptive anchor text.

Report concrete suggested values, then stage them with update_frontmatter.`,
    source: 'builtin',
    enabled: true,
  },
  {
    id: 'markdown-style',
    name: 'Markdown style',
    description: 'Use when formatting or restructuring prose so it matches the blog house style.',
    content: `# Markdown house style

- One sentence per line is fine; keep paragraphs short (2–4 sentences).
- Use sentence case for headings.
- Prefer lists over long comma-separated sentences.
- Code, commands and filenames go in backticks; blocks in fenced code with a language.
- Bold for UI labels, italics for emphasis — never both.
- Do not add a title heading if the frontmatter already carries the title.`,
    source: 'builtin',
    enabled: true,
  },
  {
    id: 'alt-text',
    name: 'Image alt text',
    description: 'Use when the user needs accessible alt text for images in the draft.',
    content: `# Image alt text

Write alt text that:
- describes the content and purpose, not "image of";
- stays under ~125 characters;
- omits "photo", "screenshot" unless it changes the meaning;
- references text in the image only when it is essential.

For decorative images, suggest an empty alt attribute.`,
    source: 'builtin',
    enabled: true,
  },
];

export function listSkillDefinitions(
  config: AgentConfig = getAgentConfig(),
): AgentSkillDefinition[] {
  const disabled = new Set(config.skillsDisabledBuiltins);
  const builtins = BUILTIN_SKILLS.map(skill => ({
    ...skill,
    enabled: !disabled.has(skill.id),
  }));
  const custom: AgentSkillDefinition[] = config.skills.map(skill => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    content: skill.content,
    source: 'custom',
    enabled: skill.enabled,
  }));
  return [...builtins, ...custom];
}

export function enabledSkillDefinitions(
  config: AgentConfig = getAgentConfig(),
): AgentSkillDefinition[] {
  return listSkillDefinitions(config).filter(skill => skill.enabled && skill.name.trim() !== '');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * The system-prompt section advertising enabled skills. Empty when there are
 * none. Full skill content is deliberately withheld — the model loads it via
 * the `use_skill` tool.
 */
export function skillsSystemPrompt(config: AgentConfig = getAgentConfig()): string {
  const skills = enabledSkillDefinitions(config);
  if (skills.length === 0) {
    return '';
  }

  const lines = [
    '## Skills',
    'You can load specialized instructions for specific tasks. When a task matches a skill description below, call the `use_skill` tool with the skill name, then follow the returned instructions.',
    '',
    '<available_skills>',
  ];

  for (const skill of skills) {
    lines.push('  <skill>');
    lines.push(`    <name>${escapeXml(skill.name)}</name>`);
    lines.push(`    <description>${escapeXml(skill.description)}</description>`);
    lines.push('  </skill>');
  }

  lines.push('</available_skills>');
  return lines.join('\n');
}

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }], details: {} };
}

const useSkillParameters = Type.Object({
  name: Type.String({ description: 'Exact name of the skill to load' }),
});

/** The on-demand skill loader. Reads the live registry on every call. */
export function buildUseSkillTool(): AgentTool<typeof useSkillParameters> {
  return {
    name: USE_SKILL_TOOL_ID,
    label: 'Use skill',
    description:
      'Load the full instructions for one of the available skills by its exact name. Call this when a task matches a skill description, then follow the returned instructions.',
    parameters: useSkillParameters,
    execute: async (_id, args) => {
      const skills = enabledSkillDefinitions();
      const wanted = args.name.trim().toLowerCase();
      const skill = skills.find(candidate => candidate.name.trim().toLowerCase() === wanted);

      if (skill === undefined) {
        const names = skills.map(candidate => candidate.name);
        const hint = names.length > 0 ? names.join(', ') : 'none configured';
        return textResult(`No enabled skill named "${args.name}". Available skills: ${hint}.`);
      }

      return textResult(`<skill name="${skill.name}">\n${skill.content}\n</skill>`);
    },
  };
}

/** Enabled skill tools (empty when no skill is enabled). */
export function buildSkillTools(): AgentTool<any>[] {
  return enabledSkillDefinitions().length === 0 ? [] : [buildUseSkillTool()];
}
