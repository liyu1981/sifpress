import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage, ThinkingLevel } from '@earendil-works/pi-agent-core';
import {
  ArrowLeft,
  Bot,
  Check,
  Globe,
  KeyRound,
  Loader2,
  MessageSquare,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePageTitle } from '@/hooks/use-page-title';
import { buildAgent } from '@/lib/agent/agent';
import { type ConfirmRequest, setConfirmHandler } from '@/lib/agent/confirm';
import {
  clearApiKey,
  getModel,
  getOllamaBaseUrl,
  hasCredential,
  listModels,
  OLLAMA_PROVIDER_ID,
  refreshModels,
  saveApiKey,
  setOllamaBaseUrl,
} from '@/lib/agent/models';
import {
  deleteSession,
  getSession,
  listSessions,
  saveSession,
  type AgentSession,
  type AgentSessionSummary,
} from '@/lib/agent/store';
import { buildAgentTools } from '@/lib/agent/tools';
import { pagesApi } from '@/lib/pages';
import { MarkdownView } from '@/lib/marked';
import { cn } from '@/lib/utils';

const LAST_MODEL_KEY = 'agent.lastModel';
const THINKING_LEVELS: ThinkingLevel[] = ['off', 'low', 'medium', 'high'];

interface LastModel {
  providerId: string;
  modelId: string;
}

interface ToolChip {
  id: string;
  name: string;
  label: string;
  status: 'running' | 'done' | 'error';
}

function readLastModel(): LastModel | undefined {
  try {
    const raw = localStorage.getItem(LAST_MODEL_KEY);
    return raw === null ? undefined : (JSON.parse(raw) as LastModel);
  } catch {
    return undefined;
  }
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

interface AgentPageProps {
  draftSlug?: string;
}

export function AgentPage({ draftSlug }: AgentPageProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  usePageTitle(t('agent.title'));

  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [session, setSession] = useState<AgentSession | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [toolChips, setToolChips] = useState<ToolChip[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<ConfirmRequest | null>(null);
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const agentRef = useRef<Agent | null>(null);
  const sessionRef = useRef<AgentSession | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const loadedDraft = useRef(draftSlug ?? null);
  const initialized = useRef(false);
  const [, forceRender] = useState(0);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const toolLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of buildAgentTools()) {
      map.set(tool.name, tool.label);
    }
    return map;
  }, []);

  const persist = useCallback(async (next: AgentSession, messagesNow: AgentMessage[]) => {
    const merged: AgentSession = {
      ...next,
      messages: messagesNow,
      updatedAt: Date.now(),
    };
    await saveSession(merged);
    setSessions(prev => {
      const rest = prev.filter(s => s.id !== merged.id);
      const summary: AgentSessionSummary = {
        id: merged.id,
        title: merged.title,
        providerId: merged.providerId,
        modelId: merged.modelId,
        thinkingLevel: merged.thinkingLevel,
        systemPrompt: merged.systemPrompt,
        createdAt: merged.createdAt,
        updatedAt: merged.updatedAt,
      };
      return [summary, ...rest].sort((a, b) => b.updatedAt - a.updatedAt);
    });
    setSession(merged);
  }, []);

  const syncTranscript = useCallback(() => {
    if (agentRef.current !== null) {
      setMessages([...agentRef.current.state.messages]);
    }
  }, []);

  useEffect(() => {
    setConfirmHandler(request => setPendingConfirm(request));
    return () => {
      setConfirmHandler(null);
    };
  }, []);

  const loadSessionIntoAgent = useCallback(
    async (sessionNow: AgentSession): Promise<Agent> => {
      const previousAgent = agentRef.current;
      if (previousAgent !== null && sessionRef.current !== null) {
        await persist(sessionRef.current, previousAgent.state.messages);
      }
      previousAgent?.abort();
      const next = buildAgent({
        providerId: sessionNow.providerId,
        modelId: sessionNow.modelId,
        systemPrompt: sessionNow.systemPrompt,
        thinkingLevel: sessionNow.thinkingLevel,
        messages: sessionNow.messages,
        sessionId: sessionNow.id,
      });
      agentRef.current = next;
      setMessages([...sessionNow.messages]);
      setStreaming(false);
      setStreamingText('');
      setIsThinking(false);
      setToolChips([]);
      setRunError(null);
      return next;
    },
    [persist],
  );

  const subscribeAgent = useCallback(
    (instance: Agent, sessionNow: AgentSession) => {
      instance.subscribe(event => {
        if (agentRef.current !== instance) {
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
              },
            ]);
            break;
          case 'tool_execution_end':
            setToolChips(prev =>
              prev.map(chip =>
                chip.id === event.toolCallId
                  ? { ...chip, status: event.isError ? 'error' : 'done' }
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
            void persist(sessionRef.current ?? sessionNow, instance.state.messages);
            setToolChips([]);
            break;
          default:
            break;
        }
      });
    },
    [persist, syncTranscript, toolLabels],
  );

  const buildSystemPrompt = useCallback(
    (draft?: { slug: string; title: string; content: string }): string => {
      const language = i18n.language?.startsWith('zh') ? 'Chinese' : 'English';
      const base = t('agent.systemPrompt', { language });
      if (draft === undefined) {
        return base;
      }
      return `${base}\n\n## Current draft the user is editing\n- slug: ${draft.slug}\n- title: ${draft.title}\n\n\`\`\`markdown\n${draft.content}\n\`\`\`\n\nWhen the user asks something about their draft, answer using this draft. Updates to it go through update_page.`;
    },
    [t, i18n.language],
  );

  const defaultModel = useCallback((): { providerId: string; modelId: string } => {
    const last = readLastModel();
    if (
      last !== undefined &&
      listModels().some(m => m.provider === last.providerId && m.model.id === last.modelId)
    ) {
      return last;
    }
    const ollamaFirst = listModels().find(m => m.provider === OLLAMA_PROVIDER_ID);
    const anyModel = listModels()[0];
    const fallback = ollamaFirst ?? anyModel;
    return fallback !== undefined
      ? { providerId: fallback.provider, modelId: fallback.model.id }
      : { providerId: OLLAMA_PROVIDER_ID, modelId: 'llama3.1:8b' };
  }, []);

  const createSession = useCallback(
    async (options?: { draft?: { slug: string; title: string; content: string } }) => {
      const model = defaultModel();
      const now = Date.now();
      const next: AgentSession = {
        id: crypto.randomUUID(),
        title: options?.draft !== undefined ? `Draft: ${options.draft.title}` : t('agent.untitled'),
        providerId: model.providerId,
        modelId: model.modelId,
        thinkingLevel: 'off',
        systemPrompt: buildSystemPrompt(options?.draft),
        createdAt: now,
        updatedAt: now,
        messages: [],
      };
      await saveSession(next);
      setSessions(prev => [
        {
          id: next.id,
          title: next.title,
          providerId: next.providerId,
          modelId: next.modelId,
          thinkingLevel: next.thinkingLevel,
          systemPrompt: next.systemPrompt,
          createdAt: now,
          updatedAt: now,
        },
        ...prev,
      ]);
      setActiveId(next.id);
      setSession(next);
      const instance = await loadSessionIntoAgent(next);
      subscribeAgent(instance, next);
      return next;
    },
    [buildSystemPrompt, defaultModel, loadSessionIntoAgent, subscribeAgent, t],
  );

  const openSession = useCallback(
    async (id: string) => {
      const stored = await getSession(id);
      if (stored === undefined) {
        return;
      }
      setActiveId(id);
      setSession(stored);
      const instance = await loadSessionIntoAgent(stored);
      subscribeAgent(instance, stored);
    },
    [loadSessionIntoAgent, subscribeAgent],
  );

  useEffect(() => {
    if (initialized.current) {
      return;
    }
    initialized.current = true;
    void (async () => {
      const stored = await listSessions();
      setSessions(stored);
      if (loadedDraft.current !== null) {
        try {
          const page = await pagesApi.get({ slug: loadedDraft.current });
          await createSession({
            draft: { slug: page.slug, title: page.title, content: page.content_md },
          });
        } catch {
          await createSession();
        }
        await navigate({ to: '/agent', search: {}, replace: true });
        return;
      }
      if (stored.length > 0) {
        await openSession(stored[0].id);
      }
    })();
    void refreshModels().then(() => forceRender(v => v + 1));
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (text === '' || streaming) {
      return;
    }
    let sessionNow = session;
    if (agentRef.current === null) {
      sessionNow = await createSession();
    }
    const instance = agentRef.current;
    if (instance === null || sessionNow === null) {
      return;
    }
    setInput('');
    setStreaming(true);
    setRunError(null);
    try {
      await instance.prompt(text);
      if (agentRef.current !== instance) {
        return;
      }
      const current = sessionRef.current ?? sessionNow;
      if (current.title === t('agent.untitled')) {
        const title = text.slice(0, 48) + (text.length > 48 ? '…' : '');
        await persist({ ...current, title }, instance.state.messages);
      }
    } catch (err) {
      setStreaming(false);
      setRunError(err instanceof Error ? err.message : String(err));
    }
  }, [createSession, input, persist, session, streaming, t]);

  const handleStop = useCallback(() => {
    agentRef.current?.abort();
  }, []);

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (activeId === id) {
        agentRef.current?.abort();
        agentRef.current = null;
        setActiveId(null);
        setSession(null);
        setMessages([]);
        setStreaming(false);
        setStreamingText('');
        setToolChips([]);
      }
    },
    [activeId],
  );

  const changeModel = useCallback(
    (providerId: string, modelId: string) => {
      localStorage.setItem(LAST_MODEL_KEY, JSON.stringify({ providerId, modelId }));
      setSession(prev => {
        if (prev === null) {
          return prev;
        }
        const next = { ...prev, providerId, modelId };
        void persist(next, agentRef.current?.state.messages ?? prev.messages);
        if (agentRef.current !== null) {
          const model = getModel(providerId, modelId);
          if (model !== undefined) {
            agentRef.current.state.model = model;
          }
        }
        return next;
      });
    },
    [persist],
  );

  useEffect(() => {
    const el = transcriptRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamingText, toolChips]);

  const allModels = listModels();
  const activeModelValue =
    session !== null ? `${session.providerId}::${session.modelId}` : undefined;

  const renderMessage = (message: AgentMessage, index: number) => {
    if (message.role === 'user') {
      return (
        <div key={index} className="flex justify-end">
          <div className="max-w-[85%] rounded-2xl bg-accent px-4 py-2.5 text-sm text-accent-foreground">
            <p className="whitespace-pre-wrap">{messageText(message)}</p>
          </div>
        </div>
      );
    }
    if (message.role === 'toolResult') {
      return (
        <div key={index} className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
          <Check className="size-3.5 shrink-0 text-muted-foreground/60" />
          <span className="truncate">
            {message.isError ? t('agent.toolError') : t('agent.toolDone')} · {message.toolName}
          </span>
        </div>
      );
    }
    if (message.role !== 'assistant') {
      return null;
    }
    const text = messageText(message);
    const calledTools = message.content.filter(b => b.type === 'toolCall');
    if (text === '' && calledTools.length === 0) {
      return null;
    }
    return (
      <div key={index} className="flex items-start gap-3">
        <div className="glass-control mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
          <Bot className="size-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 max-w-[85%] space-y-2">
          {text !== '' && (
            <div className="glass-control rounded-2xl px-4 py-3">
              <MarkdownView content={text} />
            </div>
          )}
          {calledTools.map((call, i) => (
            <Badge key={i} variant="outline" className="font-normal">
              <Sparkles className="size-3" />
              {t('agent.usedTool', { tool: toolLabels.get(call.name) ?? call.name })}
            </Badge>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="grid h-[calc(100dvh-13rem)] min-h-[480px] gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="glass-control flex min-h-0 flex-col rounded-2xl p-3">
        <div className="flex items-center justify-between gap-2 px-1 pb-3">
          <span className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4 text-muted-foreground" />
            {t('agent.title')}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => void createSession()}>
            <Plus />
            <span className="sr-only">{t('agent.newChat')}</span>
          </Button>
        </div>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {sessions.length === 0 && (
            <p className="px-1 text-xs text-muted-foreground">{t('agent.noSessions')}</p>
          )}
          {sessions.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openSession(item.id)}
              className={cn(
                'group flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors',
                item.id === activeId ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
              )}
            >
              <MessageSquare className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatTime(item.updatedAt)}
                </span>
              </span>
              <span
                role="button"
                tabIndex={0}
                className="hidden shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                onClick={event => {
                  event.stopPropagation();
                  void handleDeleteSession(item.id);
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.stopPropagation();
                    void handleDeleteSession(item.id);
                  }
                }}
                aria-label={t('agent.deleteChat')}
              >
                <Trash2 className="size-3.5" />
              </span>
            </button>
          ))}
        </div>
        <div className="border-t border-border/60 pt-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => setSettingsOpen(v => !v)}
          >
            <Settings2 />
            {t('agent.settingsTitle')}
          </Button>
        </div>
      </aside>

      <section className="glass-control flex min-h-0 flex-col overflow-hidden rounded-2xl">
        {session === null ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent/40 text-accent">
              <Bot className="size-6" />
            </div>
            <h2 className="font-heading text-lg font-bold">{t('agent.emptyTitle')}</h2>
            <p className="max-w-sm text-sm text-muted-foreground">{t('agent.emptyDescription')}</p>
            <Button onClick={() => void createSession()}>
              <Plus />
              {t('agent.newChat')}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                {draftSlug !== undefined && (
                  <Button asChild variant="ghost" size="icon-sm">
                    <Link to="/editor/$slug" params={{ slug: draftSlug }}>
                      <ArrowLeft />
                      <span className="sr-only">{t('agent.backToEditor')}</span>
                    </Link>
                  </Button>
                )}
                <span className="truncate text-sm font-medium">{session.title}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Select
                  value={session.thinkingLevel}
                  onValueChange={value => {
                    const level = value as ThinkingLevel;
                    if (agentRef.current !== null) {
                      agentRef.current.state.thinkingLevel = level;
                    }
                    setSession(prev => {
                      if (prev === null) {
                        return prev;
                      }
                      const next = { ...prev, thinkingLevel: level };
                      void persist(next, agentRef.current?.state.messages ?? prev.messages);
                      return next;
                    });
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="max-w-32"
                    aria-label={t('agent.thinkingLevelField')}
                  >
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
                <Select
                  value={activeModelValue}
                  onValueChange={value => {
                    const [providerId, modelId] = value.split('::', 2);
                    if (providerId !== undefined && modelId !== undefined) {
                      changeModel(providerId, modelId);
                    }
                  }}
                >
                  <SelectTrigger size="sm" className="max-w-56">
                    <SelectValue placeholder={t('agent.selectModelPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {allModels.map(m => (
                      <SelectItem
                        key={`${m.provider}::${m.model.id}`}
                        value={`${m.provider}::${m.model.id}`}
                      >
                        {m.model.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          · {m.providerName}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div ref={transcriptRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              {messages.length === 0 && !streaming && (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                  <p className="text-sm text-muted-foreground">{t('agent.chatHint')}</p>
                </div>
              )}
              {messages.map(renderMessage)}
              {isThinking && streamingText === '' && (
                <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('agent.thinking')}
                </div>
              )}
              {streamingText !== '' && (
                <div className="flex items-start gap-3">
                  <div className="glass-control mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg">
                    <Bot className="size-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 max-w-[85%] rounded-2xl border border-border/40 bg-muted/40 px-4 py-3">
                    {streamingText !== '' && (
                      <pre className="whitespace-pre-wrap font-sans text-sm">{streamingText}</pre>
                    )}
                    {streamingText === '' && (
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="size-3.5 animate-spin" />
                        {t('agent.thinking')}
                      </span>
                    )}
                  </div>
                </div>
              )}
              {toolChips.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-2">
                  {toolChips.map(chip => (
                    <Badge key={chip.id} variant="outline" className="gap-1 font-normal">
                      {chip.status === 'running' && <Loader2 className="size-3 animate-spin" />}
                      {chip.status === 'done' && <Check className="size-3" />}
                      {chip.status === 'error' && <X className="size-3 text-destructive" />}
                      {chip.label}
                    </Badge>
                  ))}
                </div>
              )}
              {runError !== null && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
                  {t('agent.errorPrefix')} {runError}
                </div>
              )}
            </div>

            <div className="border-t border-border/60 p-3">
              <form
                onSubmit={event => {
                  event.preventDefault();
                  void handleSend();
                }}
                className="flex items-end gap-2"
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
                  className="min-h-11 flex-1 resize-none rounded-xl border border-input bg-transparent px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
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
                  <Button type="submit" size="icon" disabled={input.trim() === ''}>
                    <Send />
                    <span className="sr-only">{t('agent.send')}</span>
                  </Button>
                )}
              </form>
            </div>
          </>
        )}
      </section>

      {settingsOpen && (
        <SettingsPanel
          onClose={() => setSettingsOpen(false)}
          onRefresh={() => forceRender(v => v + 1)}
        />
      )}

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

function SettingsPanel({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const { t } = useTranslation();
  const providers = listModels()
    .map(m => ({ id: m.provider, name: m.providerName }))
    .filter((p, i, arr) => arr.findIndex(x => x.id === p.id) === i);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [ollamaUrl, setOllamaUrl] = useState(getOllamaBaseUrl());
  const [savingOllama, setSavingOllama] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    void (async () => {
      const entries: Record<string, string> = {};
      const saved: Record<string, boolean> = {};
      for (const provider of providers) {
        saved[provider.id] = hasCredential(provider.id);
      }
      setSavedKeys(saved);
      setKeys(entries);
    })();
  }, [providers]);

  async function handleSaveKey(providerId: string) {
    const key = (keys[providerId] ?? '').trim();
    if (key === '') {
      return;
    }
    await saveApiKey(providerId, key);
    setSavedKeys(prev => ({ ...prev, [providerId]: true }));
    toast.success(t('agent.keySaved'));
  }

  async function handleClearKey(providerId: string) {
    await clearApiKey(providerId);
    setSavedKeys(prev => ({ ...prev, [providerId]: false }));
    toast.success(t('agent.keyCleared'));
  }

  async function handleSaveOllama() {
    setSavingOllama(true);
    setOllamaBaseUrl(ollamaUrl);
    setSavingOllama(false);
    toast.success(t('agent.ollamaSaved'));
  }

  async function handleRefresh() {
    setRefreshing(true);
    await refreshModels();
    setRefreshing(false);
    onRefresh();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <Card
        size="sm"
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto"
        onClick={event => event.stopPropagation()}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="size-4 text-muted-foreground" />
              {t('agent.settingsTitle')}
            </CardTitle>
            <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('agent.close')}>
              <X />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-xs text-muted-foreground">{t('agent.settingsDescription')}</p>

          <div className="space-y-4">
            {providers.map(provider => (
              <div key={provider.id} className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  {provider.name}
                  {provider.id === OLLAMA_PROVIDER_ID && (
                    <span className="text-xs text-muted-foreground">
                      ({t('agent.noKeyNeeded')})
                    </span>
                  )}
                  {savedKeys[provider.id] && <Badge variant="secondary">{t('agent.keySet')}</Badge>}
                </Label>
                <div className="flex gap-1.5">
                  <Input
                    type="password"
                    value={keys[provider.id] ?? ''}
                    onChange={event =>
                      setKeys(prev => ({ ...prev, [provider.id]: event.target.value }))
                    }
                    placeholder={
                      provider.id === OLLAMA_PROVIDER_ID
                        ? t('agent.ollamaKeyPlaceholder')
                        : t('agent.apiKeyPlaceholder')
                    }
                    className="flex-1"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSaveKey(provider.id)}
                    disabled={(keys[provider.id] ?? '').trim() === ''}
                  >
                    {t('agent.saveKey')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleClearKey(provider.id)}
                    disabled={!savedKeys[provider.id]}
                  >
                    {t('agent.clearKey')}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 border-t border-border/60 pt-4">
            <Label className="flex items-center gap-1.5">
              <Globe className="size-3.5 text-muted-foreground" />
              {t('agent.ollamaBaseUrlField')}
            </Label>
            <div className="flex gap-1.5">
              <Input
                value={ollamaUrl}
                onChange={event => setOllamaUrl(event.target.value)}
                placeholder="http://localhost:11434"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleSaveOllama()}
                disabled={savingOllama}
              >
                {t('agent.save')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('agent.ollamaBaseUrlHint')}</p>
          </div>

          <div className="flex items-center justify-between border-t border-border/60 pt-4">
            <span className="text-sm">{t('agent.refreshModels')}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
            >
              {refreshing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t('agent.refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConfirmDialog({
  request,
  onResolve,
}: {
  request: ConfirmRequest;
  onResolve: (ok: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <Card size="sm" className="w-full max-w-lg" onClick={event => event.stopPropagation()}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Pencil className="size-4 text-muted-foreground" />
            {request.kind === 'create'
              ? t('agent.confirmCreateTitle')
              : t('agent.confirmUpdateTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">{t('agent.confirmHint')}</p>
          <p className="rounded-lg bg-muted/50 px-3 py-2 text-sm font-medium">{request.summary}</p>
          {request.detail !== '' && (
            <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border/40 bg-muted/30 px-3 py-2 font-sans text-xs">
              {request.detail}
            </pre>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => onResolve(false)}>
              {t('agent.confirmReject')}
            </Button>
            <Button onClick={() => onResolve(true)}>
              <Check />
              {t('agent.confirmApprove')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
