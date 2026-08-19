import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage, ThinkingLevel } from '@earendil-works/pi-agent-core';
import {
  Bot,
  Check,
  ChevronDown,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { buildAgent } from '@/lib/agent/agent';
import { type ConfirmRequest, setConfirmHandler } from '@/lib/agent/confirm';
import type { EditorMutationBridge } from '@/lib/agent/editor-mutations';
import {
  getModel,
  listAvailableModels,
  OLLAMA_PROVIDER_ID,
  refreshModels,
} from '@/lib/agent/models';
import { deleteSession, listSessionsFull, saveSession, type AgentSession } from '@/lib/agent/store';
import { buildAgentTools } from '@/lib/agent/tools';
import { MarkdownView } from '@/lib/marked';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from './confirm-dialog';

const LAST_MODEL_KEY = 'agent.lastModel';
const THINKING_LEVELS: ThinkingLevel[] = ['off', 'low', 'medium', 'high'];

export interface AgentDraft {
  slug: string;
  title: string;
  content: string;
}

interface AgentChatProps {
  draft?: AgentDraft | null;
  editor?: EditorMutationBridge | null;
  onClose?: () => void;
  className?: string;
}

interface ToolChip {
  id: string;
  name: string;
  label: string;
  status: 'running' | 'done' | 'error';
  args?: Record<string, unknown>;
  result?: unknown;
}

function readLastModel(): { providerId: string; modelId: string } | undefined {
  try {
    const raw = localStorage.getItem(LAST_MODEL_KEY);
    return raw === null ? undefined : (JSON.parse(raw) as { providerId: string; modelId: string });
  } catch {
    return undefined;
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function messageText(message: AgentMessage): string {
  if (message.role === 'assistant') {
    return message.content
      .filter(b => b.type === 'text')
      .map(b => (b.type === 'text' ? b.text : ''))
      .join('\n');
  }
  if (message.role === 'user') {
    return typeof message.content === 'string'
      ? message.content
      : message.content
          .filter(b => b.type === 'text')
          .map(b => (b.type === 'text' ? b.text : ''))
          .join('\n');
  }
  return '';
}

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AgentChat({ draft, editor, onClose, className }: AgentChatProps) {
  const { t, i18n } = useTranslation();

  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [toolChips, setToolChips] = useState<ToolChip[]>([]);
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmRequest | null>(null);
  const [input, setInput] = useState('');
  const [runError, setRunError] = useState<string | null>(null);

  const agentRef = useRef<Agent | null>(null);
  const latestRef = useRef<AgentSession | null>(null);
  const draftRef = useRef(draft ?? null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    draftRef.current = draft ?? null;
  }, [draft]);

  const latest = sessions[sessions.length - 1];

  const toolLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of buildAgentTools()) {
      map.set(tool.name, tool.label);
    }
    return map;
  }, []);

  const patchLatest = useCallback((messages: AgentMessage[]) => {
    setSessions(prev => prev.map((s, i) => (i === prev.length - 1 ? { ...s, messages } : s)));
  }, []);

  const persistSession = useCallback(async (sessionNow: AgentSession, messages: AgentMessage[]) => {
    const updated: AgentSession = { ...sessionNow, messages, updatedAt: Date.now() };
    await saveSession(updated);
    setSessions(prev =>
      [updated, ...prev.filter(s => s.id !== updated.id)].sort((a, b) => a.updatedAt - b.updatedAt),
    );
  }, []);

  const syncTranscript = useCallback(() => {
    if (agentRef.current !== null) {
      patchLatest([...agentRef.current.state.messages]);
    }
  }, [patchLatest]);

  const buildSystemPrompt = useCallback((base: string): string => {
    const draftNow = draftRef.current;
    if (draftNow === null) {
      return base;
    }
    return `${base}\n\n## Current draft the user is editing\n- slug: ${draftNow.slug}\n- title: ${draftNow.title}\n\n\`\`\`markdown\n${draftNow.content}\n\`\`\`\n\nWhen the user asks something about their draft, answer using this draft. Edits to the draft are applied to the open editor via update_frontmatter and set_content (they appear in the editor but are only saved when the user clicks Save).`;
  }, []);

  const defaultModel = useCallback((): { providerId: string; modelId: string } | undefined => {
    const available = listAvailableModels();
    const last = readLastModel();
    if (
      last !== undefined &&
      available.some(m => m.provider === last.providerId && m.model.id === last.modelId)
    ) {
      return last;
    }
    const ollamaFirst = available.find(m => m.provider === OLLAMA_PROVIDER_ID);
    const fallback = ollamaFirst ?? available[0];
    return fallback !== undefined
      ? { providerId: fallback.provider, modelId: fallback.model.id }
      : undefined;
  }, []);

  const subscribeAgent = useCallback(
    (instance: Agent, sessionNow: AgentSession) => {
      instance.subscribe(event => {
        if (agentRef.current !== instance || latestRef.current?.id !== sessionNow.id) {
          return;
        }
        switch (event.type) {
          case 'agent_start':
            setStreaming(true);
            setRunError(null);
            break;
          case 'message_start':
            if (event.message.role === 'assistant') {
              setStreamingText('');
              setIsThinking(false);
            }
            syncTranscript();
            break;
          case 'message_update': {
            const ev = event.assistantMessageEvent;
            if (ev.type === 'text_delta') {
              setStreamingText(prev => prev + ev.delta);
            } else if (ev.type === 'thinking_start') {
              setIsThinking(true);
            } else if (ev.type === 'thinking_end') {
              setIsThinking(false);
            }
            break;
          }
          case 'message_end':
            syncTranscript();
            if (event.message.role === 'assistant') {
              setStreamingText('');
              setIsThinking(false);
            }
            break;
          case 'tool_execution_start':
            setToolChips(prev => [
              ...prev,
              {
                id: event.toolCallId,
                name: event.toolName,
                label: toolLabels.get(event.toolName) ?? event.toolName,
                status: 'running',
                args: event.args,
              },
            ]);
            break;
          case 'tool_execution_end':
            setToolChips(prev =>
              prev.map(chip =>
                chip.id === event.toolCallId
                  ? { ...chip, status: event.isError ? 'error' : 'done', result: event.result }
                  : chip,
              ),
            );
            break;
          case 'agent_end':
            syncTranscript();
            setStreaming(false);
            setStreamingText('');
            setIsThinking(false);
            if (instance.state.errorMessage) {
              setRunError(instance.state.errorMessage);
            }
            void persistSession(latestRef.current ?? sessionNow, instance.state.messages);
            setToolChips([]);
            setExpandedToolCalls(new Set());
            break;
          default:
            break;
        }
      });
    },
    [persistSession, syncTranscript, toolLabels],
  );

  const buildForSession = useCallback(
    async (sessionNow: AgentSession): Promise<Agent> => {
      agentRef.current?.abort();
      const instance = buildAgent({
        providerId: sessionNow.providerId,
        modelId: sessionNow.modelId,
        systemPrompt: sessionNow.systemPrompt,
        thinkingLevel: sessionNow.thinkingLevel,
        messages: sessionNow.messages,
        sessionId: sessionNow.id,
        editor: editor ?? undefined,
      });
      agentRef.current = instance;
      latestRef.current = sessionNow;
      subscribeAgent(instance, sessionNow);
      return instance;
    },
    [editor, subscribeAgent],
  );

  const createNewSession = useCallback(async (): Promise<AgentSession | null> => {
    const model = defaultModel();
    if (model === undefined) {
      setRunError(t('agent.noModelsHint'));
      return null;
    }
    agentRef.current?.abort();
    const now = Date.now();
    const base = t('agent.systemPrompt', {
      language: i18n.language?.startsWith('zh') ? 'Chinese' : 'English',
    });
    const next: AgentSession = {
      id: newId(),
      title: t('agent.untitled'),
      providerId: model.providerId,
      modelId: model.modelId,
      thinkingLevel: 'low',
      systemPrompt: base,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await saveSession(next);
    setSessions(prev =>
      [...prev.filter(s => s.id !== next.id), next].sort((a, b) => a.updatedAt - b.updatedAt),
    );
    setCollapsed(prev => {
      const expanded = new Set<string>(prev);
      for (const s of sessions) {
        if (s.id !== next.id) {
          expanded.add(s.id);
        }
      }
      expanded.delete(next.id);
      return expanded;
    });
    latestRef.current = next;
    await buildForSession(next);
    setStreaming(false);
    setStreamingText('');
    setToolChips([]);
    setRunError(null);
    return next;
  }, [buildForSession, defaultModel, i18n.language, sessions, t]);

  useEffect(() => {
    if (initialized.current) {
      return;
    }
    initialized.current = true;
    setConfirmHandler(request => setPendingConfirm(request));
    void (async () => {
      await refreshModels().catch(() => undefined);
      const all = await listSessionsFull();
      all.sort((a, b) => a.updatedAt - b.updatedAt);
      if (all.length > 0) {
        setSessions(all);
        const newest = all[all.length - 1];
        latestRef.current = newest;
        setCollapsed(new Set(all.slice(0, -1).map(s => s.id)));
        await buildForSession(newest);
      } else {
        await createNewSession();
      }
    })();
    return () => {
      setConfirmHandler(null);
      agentRef.current?.abort();
      agentRef.current = null;
    };
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [sessions, streamingText, toolChips]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (text === '' || streaming) {
      return;
    }
    let sessionNow = latestRef.current;
    if (sessionNow === null) {
      const created = await createNewSession();
      if (created === null) {
        return;
      }
      sessionNow = created;
    }
    const instance = agentRef.current;
    if (instance === null) {
      return;
    }
    latestRef.current = sessionNow;
    instance.state.systemPrompt = buildSystemPrompt(sessionNow.systemPrompt);
    setInput('');
    setStreaming(true);
    setRunError(null);
    try {
      await instance.prompt(text);
      if (sessionNow.title === t('agent.untitled')) {
        const title = text.slice(0, 40) + (text.length > 40 ? '…' : '');
        await persistSession({ ...sessionNow, title }, instance.state.messages);
      }
    } catch (err) {
      setStreaming(false);
      setRunError(err instanceof Error ? err.message : String(err));
    }
  }, [buildSystemPrompt, createNewSession, input, persistSession, streaming, t]);

  const handleStop = useCallback(() => {
    agentRef.current?.abort();
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      const remaining = sessions.filter(s => s.id !== id);
      await deleteSession(id);
      setSessions(remaining);
      if (id === sessions[sessions.length - 1]?.id) {
        if (remaining.length > 0) {
          const newest = remaining[remaining.length - 1];
          await buildForSession(newest);
        } else {
          agentRef.current?.abort();
          agentRef.current = null;
          latestRef.current = null;
        }
      }
    },
    [buildForSession, sessions],
  );

  const toggleCollapsed = useCallback((id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const changeModel = useCallback(
    (providerId: string, modelId: string) => {
      localStorage.setItem(LAST_MODEL_KEY, JSON.stringify({ providerId, modelId }));
      const instance = agentRef.current;
      if (instance !== null && latestRef.current !== null) {
        const model = getModel(providerId, modelId);
        if (model !== undefined) {
          instance.state.model = model;
        }
        const next = { ...latestRef.current, providerId, modelId };
        latestRef.current = next;
        void persistSession(next, instance.state.messages);
      }
    },
    [persistSession],
  );

  const changeThinking = useCallback(
    (level: ThinkingLevel) => {
      const instance = agentRef.current;
      if (instance !== null && latestRef.current !== null) {
        instance.state.thinkingLevel = level;
        const next = { ...latestRef.current, thinkingLevel: level };
        latestRef.current = next;
        void persistSession(next, instance.state.messages);
      }
    },
    [persistSession],
  );

  const allModels = listAvailableModels();
  const latestModelValue =
    latest !== undefined ? `${latest.providerId}::${latest.modelId}` : undefined;

  const toggleToolCall = useCallback((id: string) => {
    setExpandedToolCalls(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const renderMessage = (message: AgentMessage, index: number, allMessages?: AgentMessage[]) => {
    if (message.role === 'user') {
      return (
        <div key={index} className="flex justify-end">
          <div className="max-w-[88%] rounded-2xl bg-accent px-3 py-2 text-sm text-accent-foreground">
            <p className="whitespace-pre-wrap">{messageText(message)}</p>
          </div>
        </div>
      );
    }
    if (message.role === 'toolResult') {
      return null;
    }
    if (message.role !== 'assistant') {
      return null;
    }
    const text = messageText(message);
    const calledTools = message.content.filter(b => b.type === 'toolCall');
    if (text === '' && calledTools.length === 0) {
      return null;
    }

    const toolResultMap = new Map<string, AgentMessage>();
    if (allMessages) {
      for (const m of allMessages) {
        if (m.role === 'toolResult') {
          toolResultMap.set(m.toolCallId, m);
        }
      }
    }

    return (
      <div key={index} className="flex items-start gap-2">
        <div className="glass-control-opaque mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg">
          <Bot className="size-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 max-w-[88%] space-y-1.5">
          {text !== '' && (
            <div className="glass-control-opaque rounded-2xl px-3 py-2">
              <MarkdownView content={text} />
            </div>
          )}
          {calledTools.map((call, i) => {
            const expanded = expandedToolCalls.has(call.id);
            const resultMsg = toolResultMap.get(call.id);
            const hasDetails = resultMsg !== undefined;
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={hasDetails ? () => toggleToolCall(call.id) : undefined}
                  className={`flex items-center gap-1 rounded-lg border border-border/40 px-2 py-1 text-xs font-normal ${hasDetails ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                >
                  <Sparkles className="size-3" />
                  <span>
                    {t('agent.usedTool', { tool: toolLabels.get(call.name) ?? call.name })}
                  </span>
                  {hasDetails && (
                    <ChevronDown
                      className={`size-3 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
                    />
                  )}
                </button>
                {expanded && hasDetails && resultMsg && resultMsg.role === 'toolResult' && (
                  <div className="mt-1 space-y-1 rounded-lg border border-border/40 bg-muted/30 p-2 text-xs">
                    <div>
                      <span className="font-medium text-muted-foreground">
                        {t('agent.toolArgs')}:
                      </span>
                      <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mans text-foreground/80">
                        {JSON.stringify(call.arguments, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">
                        {resultMsg.isError ? t('agent.toolError') : t('agent.toolResult')}:
                      </span>
                      <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mans text-foreground/80">
                        {resultMsg.content
                          .map(b => (b.type === 'text' ? b.text : '[image]'))
                          .join('\n')}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'glass-control-opaque flex h-full min-h-0 flex-col overflow-hidden rounded-2xl',
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Bot className="size-4 text-muted-foreground" />
          {t('agent.title')}
        </span>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => void createNewSession()}
            aria-label={t('agent.newChat')}
          >
            <Plus />
          </Button>
          {onClose !== undefined && (
            <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label={t('agent.close')}>
              <X />
            </Button>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {sessions.length === 0 && allModels.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-1.5 px-3 py-8 text-center">
            <Bot className="size-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{t('agent.noModelsHint')}</p>
          </div>
        )}
        {sessions.map((s, index) => {
          const isLatest = index === sessions.length - 1;
          const isCollapsed = collapsed.has(s.id);
          return (
            <div key={s.id} className="glass-control-opaque overflow-hidden rounded-xl">
              <div className="flex items-center gap-1 border-b border-border/40 p-1.5 pr-2">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(s.id)}
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-muted"
                  aria-expanded={!isCollapsed}
                >
                  <ChevronDown
                    className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                  />
                  <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-xs font-medium">{s.title}</span>
                  {isLatest && <Badge variant="secondary">{t('agent.active')}</Badge>}
                  <span className="ml-auto shrink-0 text-[0.65rem] text-muted-foreground">
                    {formatTime(s.updatedAt)}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => void handleDeleteSession(s.id)}
                  aria-label={t('agent.deleteChat')}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
              {!isCollapsed && (
                <div className="space-y-2.5 p-2">
                  {s.messages.length === 0 && !isLatest && (
                    <p className="px-1 text-xs text-muted-foreground">{t('agent.noMessages')}</p>
                  )}
                  {s.messages.map((msg, i) => renderMessage(msg, i, s.messages))}
                  {isLatest && isThinking && streamingText === '' && (
                    <div className="flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
                      <Loader2 className="size-3 animate-spin" />
                      {t('agent.thinking')}
                    </div>
                  )}
                  {isLatest && streamingText !== '' && (
                    <div className="flex items-start gap-2">
                      <div className="glass-control-opaque mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg">
                        <Bot className="size-3.5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0 max-w-[88%] rounded-2xl border border-border/40 bg-muted/40 px-3 py-2">
                        <pre className="whitespace-pre-wrap font-sans text-sm">{streamingText}</pre>
                      </div>
                    </div>
                  )}
                  {isLatest && toolChips.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      {toolChips.map(chip => {
                        const expanded = expandedToolCalls.has(chip.id);
                        const hasDetails = chip.args !== undefined;
                        return (
                          <div key={chip.id}>
                            <button
                              type="button"
                              onClick={hasDetails ? () => toggleToolCall(chip.id) : undefined}
                              className={`flex items-center gap-1 rounded-lg border border-border/40 bg-muted/40 px-2 py-1 text-xs ${hasDetails ? 'cursor-pointer hover:bg-muted/60' : ''}`}
                            >
                              {chip.status === 'running' && (
                                <Loader2 className="size-3 animate-spin" />
                              )}
                              {chip.status === 'done' && <Check className="size-3" />}
                              {chip.status === 'error' && <X className="size-3 text-destructive" />}
                              <span>{chip.label}</span>
                              {hasDetails && (
                                <ChevronDown
                                  className={`size-3 shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`}
                                />
                              )}
                            </button>
                            {expanded && hasDetails && (
                              <div className="mt-1 space-y-1 rounded-lg border border-border/40 bg-muted/30 p-2 text-xs">
                                {chip.args !== undefined && (
                                  <div>
                                    <span className="font-medium text-muted-foreground">
                                      {t('agent.toolArgs')}:
                                    </span>
                                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mans text-foreground/80">
                                      {JSON.stringify(chip.args, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {chip.result !== undefined && (
                                  <div>
                                    <span className="font-medium text-muted-foreground">
                                      {t('agent.toolResult')}:
                                    </span>
                                    <pre className="mt-0.5 max-h-40 overflow-auto whitespace-pre-wrap break-all font-mans text-foreground/80">
                                      {typeof chip.result === 'string'
                                        ? chip.result
                                        : JSON.stringify(chip.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {isLatest && runError !== null && (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive">
                      {t('agent.errorPrefix')} {runError}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <footer className="space-y-1.5 border-t border-border/60 p-2">
        <div className="flex items-center gap-1.5">
          <Select
            value={latestModelValue}
            onValueChange={value => {
              const [providerId, modelId] = value.split('::', 2);
              if (providerId !== undefined && modelId !== undefined) {
                changeModel(providerId, modelId);
              }
            }}
          >
            <SelectTrigger
              size="sm"
              className="min-w-0 flex-1"
              aria-label={t('agent.selectModelPlaceholder')}
            >
              <SelectValue placeholder={t('agent.selectModelPlaceholder')} />
            </SelectTrigger>
            <SelectContent>
              {allModels.map(m => (
                <SelectItem
                  key={`${m.provider}::${m.model.id}`}
                  value={`${m.provider}::${m.model.id}`}
                >
                  {m.model.name}
                  <span className="ml-1 text-xs text-muted-foreground">· {m.providerName}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={latest?.thinkingLevel}
            onValueChange={value => changeThinking(value as ThinkingLevel)}
          >
            <SelectTrigger size="sm" className="w-20" aria-label={t('agent.thinkingLevelField')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {THINKING_LEVELS.map(level => (
                <SelectItem key={level} value={level}>
                  {t(`agent.level.${level}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <form
          onSubmit={event => {
            event.preventDefault();
            void handleSend();
          }}
          className="flex items-stretch gap-1.5"
        >
          <textarea
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={t('agent.chatPlaceholder')}
            rows={2}
            className="min-h-10 flex-1 resize-none rounded-xl border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          {streaming ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleStop}
              aria-label={t('agent.stop')}
            >
              <Square />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              disabled={input.trim() === '' || allModels.length === 0}
            >
              <Send />
              <span className="sr-only">{t('agent.send')}</span>
            </Button>
          )}
        </form>
      </footer>

      {pendingConfirm !== null && (
        <ConfirmDialog
          request={pendingConfirm}
          onResolve={ok => {
            pendingConfirm.resolve(ok);
            setPendingConfirm(null);
          }}
        />
      )}
    </div>
  );
}
