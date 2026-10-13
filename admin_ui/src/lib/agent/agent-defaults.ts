import {
  getAgentConfig,
  saveMcpServers,
  updateAgentConfig,
  type AgentSkillConfig,
} from '@liyu1981/reagent';

/**
 * Host-side defaults for ReAgent.
 *
 * `@liyu1981/reagent` is deliberately opinion-free: it ships no built-in
 * skills and no MCP servers. Sifpress used to carry these in its private fork,
 * so they are re-declared here and seeded into the shared `AgentConfig` on
 * first run. After the first seed the values are ordinary user data — users
 * can edit, disable or delete them, and they will not come back.
 */

const SEEDED_KEY = 'sifpress.agent.defaults.v1';

const EXA_SERVER = {
  id: 'exa',
  name: 'Exa',
  url: 'https://mcp.exa.ai/mcp',
  enabled: true,
};

const DEFAULT_SKILLS: AgentSkillConfig[] = [
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
    enabled: true,
  },
];

/**
 * Seed the Sifpress skills and the Exa MCP server into the agent config. Safe
 * to call on every startup: it runs once (guarded by a localStorage marker) and
 * merges by id so it never clobbers a user's own skills or servers.
 */
export function seedAgentDefaults(): void {
  try {
    if (localStorage.getItem(SEEDED_KEY) !== null) {
      return;
    }

    const config = getAgentConfig();

    const existingSkillIds = new Set(config.skills.map(skill => skill.id));
    const skills = [
      ...config.skills,
      ...DEFAULT_SKILLS.filter(skill => !existingSkillIds.has(skill.id)),
    ];
    updateAgentConfig({ skills });

    if (!config.mcp.some(server => server.id === EXA_SERVER.id)) {
      saveMcpServers([...config.mcp, { ...EXA_SERVER }]);
    }

    localStorage.setItem(SEEDED_KEY, '1');
  } catch {
    // localStorage unavailable (privacy mode) — run with package defaults.
  }
}
