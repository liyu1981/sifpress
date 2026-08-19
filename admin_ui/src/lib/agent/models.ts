import {
  createModels,
  createProvider,
  type Api,
  type Credential,
  type CredentialInfo,
  type CredentialStore,
  type Model,
  type MutableModels,
} from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic';
import { deepseekProvider } from '@earendil-works/pi-ai/providers/deepseek';
import { groqProvider } from '@earendil-works/pi-ai/providers/groq';
import { openaiProvider } from '@earendil-works/pi-ai/providers/openai';
import { openrouterProvider } from '@earendil-works/pi-ai/providers/openrouter';

export const OLLAMA_PROVIDER_ID = 'ollama';

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';

const OLLAMA_BASE_URL_KEY = 'agent.ollama.baseUrl';

function readJson<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

/**
 * localStorage-backed CredentialStore implementing pi-ai's read/modify/delete
 * contract. Keys stay on the device; pi-ai resolves them per request and sends
 * them straight to the provider the user chose.
 */
class LocalCredentialStore implements CredentialStore {
  private readonly chains = new Map<string, Promise<unknown>>();

  private credentialKey(providerId: string): string {
    return `agent.credential.${providerId}`;
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return readJson<Credential>(this.credentialKey(providerId));
  }

  async list(): Promise<readonly CredentialInfo[]> {
    const infos: CredentialInfo[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key === null) {
        continue;
      }
      const match = key.match(/^agent\.credential\.(.+)$/);
      if (match) {
        const credential = readJson<Credential>(key);
        if (credential !== undefined) {
          infos.push({ providerId: match[1], type: credential.type });
        }
      }
    }
    return infos;
  }

  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const chain = this.chains.get(providerId) ?? Promise.resolve();
    const run = chain.then(async () => {
      const current = readJson<Credential>(this.credentialKey(providerId));
      const next = await fn(current);
      if (next === undefined) {
        localStorage.removeItem(this.credentialKey(providerId));
      } else {
        writeJson(this.credentialKey(providerId), next);
      }
      return next;
    });
    this.chains.set(
      providerId,
      run.catch(() => undefined),
    );
    return run;
  }

  async delete(providerId: string): Promise<void> {
    localStorage.removeItem(this.credentialKey(providerId));
  }
}

const credentialStore = new LocalCredentialStore();

export function getOllamaBaseUrl(): string {
  return localStorage.getItem(OLLAMA_BASE_URL_KEY) ?? DEFAULT_OLLAMA_BASE_URL;
}

export function setOllamaBaseUrl(url: string): void {
  const normalized = url.trim().replace(/\/+$/, '') || DEFAULT_OLLAMA_BASE_URL;
  localStorage.setItem(OLLAMA_BASE_URL_KEY, normalized);
  unverify(OLLAMA_PROVIDER_ID);
  rebuildModels();
}

const VERIFIED_KEY = 'agent.verified.providers';

function readVerified(): string[] {
  try {
    const raw = localStorage.getItem(VERIFIED_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeVerified(ids: string[]): void {
  localStorage.setItem(VERIFIED_KEY, JSON.stringify(ids));
}

/** Providers whose connection was verified by a successful test. */
export function isVerified(providerId: string): boolean {
  return readVerified().includes(providerId);
}

function markVerified(providerId: string): void {
  const ids = readVerified();
  if (!ids.includes(providerId)) {
    writeVerified([...ids, providerId]);
  }
}

function unverify(providerId: string): void {
  writeVerified(readVerified().filter(id => id !== providerId));
}

export function hasCredential(providerId: string): boolean {
  return localStorage.getItem(`agent.credential.${providerId}`) !== null;
}

export async function saveApiKey(providerId: string, key: string): Promise<void> {
  await credentialStore.modify(providerId, async () => ({
    type: 'api_key' as const,
    key: key.trim(),
  }));
  unverify(providerId);
}

export async function clearApiKey(providerId: string): Promise<void> {
  await credentialStore.delete(providerId);
  unverify(providerId);
}

function ollamaModel(id: string, baseUrl: string): Model<'openai-completions'> {
  return {
    id,
    name: id,
    api: 'openai-completions',
    provider: OLLAMA_PROVIDER_ID,
    baseUrl,
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 32000,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
    },
  };
}

async function fetchOllamaModels(
  apiBase: string,
  v1Url: string,
  signal: AbortSignal,
): Promise<Model<'openai-completions'>[]> {
  let ids: string[] = [];
  try {
    const response = await fetch(`${v1Url}/models`, { signal });
    if (response.ok) {
      const data = (await response.json()) as { data?: Array<{ id: string }> };
      ids = (data?.data ?? []).map(m => m.id);
    }
  } catch {
    // fall through to the native Ollama endpoint
  }
  if (ids.length === 0) {
    try {
      const response = await fetch(`${apiBase}/api/tags`, { signal });
      if (response.ok) {
        const data = (await response.json()) as { models?: Array<{ name: string }> };
        ids = (data?.models ?? []).map(m => m.name);
      }
    } catch {
      // ignore — the list stays on its static defaults
    }
  }
  return ids.filter(id => !/embed|vision|clip/i.test(id)).map(id => ollamaModel(id, v1Url));
}

function buildOllamaProvider(baseUrl: string) {
  const v1Url = `${baseUrl}/v1`;
  return createProvider({
    id: OLLAMA_PROVIDER_ID,
    name: 'Custom Local LLM (OpenAI compatible)',
    baseUrl: v1Url,
    auth: {
      apiKey: {
        name: 'Custom Local LLM (OpenAI compatible)',
        resolve: async () => ({ auth: { apiKey: 'local' } }),
      },
    },
    models: [],
    fetchModels: async ({ signal }) => fetchOllamaModels(baseUrl, v1Url, signal),
    api: openAICompletionsApi(),
  });
}

function buildModels(): MutableModels {
  const models = createModels({ credentials: credentialStore });
  models.setProvider(buildOllamaProvider(getOllamaBaseUrl()));
  models.setProvider(openaiProvider());
  models.setProvider(anthropicProvider());
  models.setProvider(openrouterProvider());
  models.setProvider(deepseekProvider());
  models.setProvider(groqProvider());
  return models;
}

let models: MutableModels | null = null;

export function getModels(): MutableModels {
  if (models === null) {
    models = buildModels();
  }
  return models;
}

export function rebuildModels(): MutableModels {
  models = buildModels();
  return models;
}

export function getModel(providerId: string, modelId: string) {
  return getModels().getModel(providerId, modelId);
}

export function listModels(): Array<{ provider: string; providerName: string; model: Model<Api> }> {
  const modelsAll = getModels();
  const out: Array<{ provider: string; providerName: string; model: Model<Api> }> = [];
  for (const provider of modelsAll.getProviders()) {
    for (const model of modelsAll.getModels(provider.id)) {
      out.push({ provider: provider.id, providerName: provider.name, model });
    }
  }
  return out;
}

/**
 * Models from providers whose connection was verified with a successful test.
 * This is the only list the agent UI should offer, so unconfigured providers
 * never show up in the model selector.
 */
export function listAvailableModels(): Array<{
  provider: string;
  providerName: string;
  model: Model<Api>;
}> {
  const modelsAll = getModels();
  const out: Array<{ provider: string; providerName: string; model: Model<Api> }> = [];
  for (const provider of modelsAll.getProviders()) {
    if (!isVerified(provider.id)) {
      continue;
    }
    for (const model of modelsAll.getModels(provider.id)) {
      out.push({ provider: provider.id, providerName: provider.name, model });
    }
  }
  return out;
}

export function refreshModels(): Promise<void> {
  return getModels()
    .refresh()
    .then(() => undefined);
}

/**
 * Minimal connection test for a provider. Cloud providers resolve auth and
 * issue a tiny completion on their first model. The local OpenAI-compatible
 * provider probes `GET /v1/models` instead, so connectivity and keyless auth
 * are verified without depending on a specific model being loaded. Rejects
 * with a human-readable message on failure.
 */
export async function testConnection(providerId: string): Promise<string> {
  const models = getModels();
  const auth = await models.getAuth(providerId);
  if (auth === undefined) {
    throw new Error('not_configured');
  }
  if (providerId === OLLAMA_PROVIDER_ID) {
    const v1Url = models.getProvider(providerId)?.baseUrl;
    if (v1Url === undefined) {
      throw new Error('no_model');
    }
    const base = v1Url.replace(/\/v1\/?$/, '');
    const response = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = (await response.json()) as { data?: Array<{ id: string }> };
    const count = data?.data?.length ?? 0;
    markVerified(providerId);
    return count > 0 ? `${count} model${count === 1 ? '' : 's'}` : 'reachable';
  }
  const model = models.getModels(providerId)[0];
  if (model === undefined) {
    throw new Error('no_model');
  }
  const response = await models.completeSimple(model, {
    messages: [{ role: 'user', content: 'Reply with exactly: ok', timestamp: Date.now() }],
  });
  if (response.stopReason === 'error' || response.stopReason === 'aborted') {
    throw new Error(response.errorMessage ?? `request_failed_${response.stopReason}`);
  }
  markVerified(providerId);
  return model.id;
}
