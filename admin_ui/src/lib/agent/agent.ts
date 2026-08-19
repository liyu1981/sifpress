import { Agent, type AgentMessage, type ThinkingLevel } from '@earendil-works/pi-agent-core';
import { getModel, getModels } from './models';
import { buildAgentTools } from './tools';
import type { EditorMutationBridge } from './editor-mutations';

export interface AgentBuildOptions {
  providerId: string;
  modelId: string;
  systemPrompt: string;
  thinkingLevel: ThinkingLevel;
  messages?: AgentMessage[];
  sessionId?: string;
  editor?: EditorMutationBridge;
}

export function buildAgent(options: AgentBuildOptions): Agent {
  const model = getModel(options.providerId, options.modelId);
  if (model === undefined) {
    throw new Error(`Unknown model: ${options.providerId}/${options.modelId}`);
  }
  const agent = new Agent({
    initialState: {
      systemPrompt: options.systemPrompt,
      model,
      thinkingLevel: options.thinkingLevel,
      tools: buildAgentTools(options.editor),
      messages: options.messages ?? [],
    },
    streamFn: getModels().streamSimple.bind(getModels()),
    toolExecution: 'parallel',
    sessionId: options.sessionId,
  });
  return agent;
}
