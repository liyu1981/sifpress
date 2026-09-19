import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';

/**
 * User-managed skills for the in-editor agent.
 *
 * Unlike pi's file-backed skills, these live entirely in this browser
 * (localStorage) and are edited in Settings → Agent. Enabled skills are
 * advertised in the system prompt and loaded on demand through the
 * `use_skill` tool, so their full content only enters the context when the
 * model actually needs it.
 */

const SKILLS_KEY = 'agent.skills';

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  content: string;
  enabled: boolean;
}

export function newSkillId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isSkill(value: unknown): value is AgentSkill {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<AgentSkill>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.content === 'string' &&
    typeof candidate.enabled === 'boolean'
  );
}

/** All stored skills (enabled and disabled). */
export function listSkills(): AgentSkill[] {
  try {
    const raw = localStorage.getItem(SKILLS_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isSkill) : [];
  } catch {
    return [];
  }
}

export function saveSkills(skills: AgentSkill[]): void {
  localStorage.setItem(SKILLS_KEY, JSON.stringify(skills));
}

export function enabledSkills(): AgentSkill[] {
  return listSkills().filter(skill => skill.enabled && skill.name.trim() !== '');
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
export function skillsSystemPrompt(): string {
  const skills = enabledSkills();
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

const useSkillTool: AgentTool<typeof useSkillParameters> = {
  name: 'use_skill',
  label: 'Use skill',
  description:
    'Load the full instructions for one of the available skills by its exact name. Call this when a task matches a skill description, then follow the returned instructions.',
  parameters: useSkillParameters,
  execute: async (_id, args) => {
    const wanted = args.name.trim().toLowerCase();
    const skill = enabledSkills().find(candidate => candidate.name.trim().toLowerCase() === wanted);

    if (skill === undefined) {
      const names = enabledSkills().map(candidate => candidate.name);
      const hint = names.length > 0 ? names.join(', ') : 'none configured';
      return textResult(`No enabled skill named "${args.name}". Available skills: ${hint}.`);
    }

    return textResult(`<skill name="${skill.name}">\n${skill.content}\n</skill>`);
  },
};

/**
 * Tools exposing stored skills to the agent. Returns an empty array when no
 * skill is enabled, so the built-in tool set stays unchanged by default.
 */
export function buildSkillTools(): AgentTool<any>[] {
  return enabledSkills().length === 0 ? [] : [useSkillTool];
}
