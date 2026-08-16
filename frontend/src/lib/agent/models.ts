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
  rebuildModels();
}

export function hasCredential(providerId: string): boolean {
  return localStorage.getItem(`agent.credential.${providerId}`) !== null;
}

export async function saveApiKey(providerId: string, key: string): Promise<void> {
  await credentialStore.modify(providerId, async () => ({
    type: 'api_key' as const,
    key: key.trim(),
  }));
}

export async function clearApiKey(providerId: string): Promise<void> {
  await credentialStore.delete(providerId);
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
  };
}

const DEFAULT_OLLAMA_MODELS = ['llama3.1:8b', 'qwen3:8b', 'qwen3:14b', 'gemma3:4b'];

async function fetchOllamaModels(
  apiBase: string,
  v1Url: string,
  signal: AbortSignal,
): Promise<Model<'openai-completions'>[]> {
  const response = await fetch(`${apiBase}/api/tags`, { signal });
  if (!response.ok) {
    throw new Error(`Ollama responded with HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    models?: Array<{ name: string }>;
  };
  return (data.models ?? [])
    .filter(m => !/embed|vision|clip/i.test(m.name))
    .map(m => ollamaModel(m.name, v1Url));
}

function buildOllamaProvider(baseUrl: string) {
  const v1Url = `${baseUrl}/v1`;
  return createProvider({
    id: OLLAMA_PROVIDER_ID,
    name: 'Ollama (local)',
    baseUrl: v1Url,
    auth: {
      apiKey: {
        name: 'Ollama (local)',
        resolve: async () => ({ auth: {} }),
      },
    },
    models: DEFAULT_OLLAMA_MODELS.map(id => ollamaModel(id, v1Url)),
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

export function refreshModels(): Promise<void> {
  return getModels()
    .refresh()
    .then(() => undefined);
}
