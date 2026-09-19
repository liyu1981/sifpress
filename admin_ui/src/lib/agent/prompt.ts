/**
 * User-editable system prompt for the in-editor agent.
 *
 * The custom prompt lives only in this browser (localStorage). When set it
 * replaces the built-in `agent.systemPrompt` text; `{{language}}` is still
 * interpolated so the assistant answers in the UI language.
 */

const CUSTOM_PROMPT_KEY = 'agent.systemPrompt.custom';

/** The raw custom system prompt, or '' when the built-in one is in use. */
export function getCustomSystemPrompt(): string {
  return localStorage.getItem(CUSTOM_PROMPT_KEY) ?? '';
}

/**
 * Save a custom system prompt. Whitespace-only input clears the override and
 * restores the built-in prompt.
 */
export function setCustomSystemPrompt(text: string): void {
  if (text.trim() === '') {
    localStorage.removeItem(CUSTOM_PROMPT_KEY);
    return;
  }
  localStorage.setItem(CUSTOM_PROMPT_KEY, text);
}

export function clearCustomSystemPrompt(): void {
  localStorage.removeItem(CUSTOM_PROMPT_KEY);
}

/**
 * Resolve the effective base prompt: the custom override when present,
 * otherwise the provided built-in default. `{{language}}` is interpolated in
 * both paths (the built-in default is usually already interpolated by i18n,
 * which is harmless).
 */
export function resolveSystemPrompt(defaultPrompt: string, language: string): string {
  const custom = getCustomSystemPrompt();
  if (custom.trim() === '') {
    return defaultPrompt;
  }
  return custom.replaceAll('{{language}}', language);
}
