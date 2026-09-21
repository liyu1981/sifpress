import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentMessage, AgentTool, ThinkingLevel } from '@earendil-works/pi-agent-core';
import {
  ArrowUp,
  Bot,
  Check,
  ChevronDown,
  Lightbulb,
  Loader2,
  MessageSquare,
  Plus,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { buildAgent } from '@/lib/agent/agent';
import type { EditorMutationBridge } from '@/lib/agent/editor-mutations';
import {
  EXA_SERVER_ID,
  mcpManager,
  setExaApiKey,
  syncMcpServersWithTimeout,
} from '@/lib/agent/mcp';
import {
  getModel,
  listAvailableModels,
  OLLAMA_PROVIDER_ID,
  refreshModels,
} from '@/lib/agent/models';
import { deleteSession, listSessionsFull, saveSession, type AgentSession } from '@/lib/agent/store';
import { AGENT_GUARDRAIL, resolveSystemPrompt } from '@/lib/agent/prompt';
import { skillsSystemPrompt } from '@/lib/agent/skills';
import { buildAgentTools } from '@/lib/agent/tools';
import { cn } from '@/lib/utils';
import {
  assetMarkdownLink,
  assetSourceUrl,
  assetsApi,
  makeVisionImage,
  MarkdownView,
} from 'ui-sdk';

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
  /** Markdown of the editor selection the user wants revised (read-only). */
  selection?: string | null;
  onClearSelection?: () => void;
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

interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  data: string;
}

const SELECTION_PREVIEW_MAX = 400;

function selectionPreview(selection: string): string {
  const flat = selection.replace(/\s+/g, ' ').trim();
  if (flat.length <= 42) {
    return flat;
  }
  const cut = flat.slice(0, 42);
  const word = cut.slice(0, cut.lastIndexOf(' '));
  return `${word.length > 16 ? word : cut}…`;
}

/** A non-empty clamped selection, or null. Drives the new-session trigger. */
function clampedSelection(selection: string | null | undefined): string | null {
  if (selection === null || selection === undefined || selection.trim() === '') {
    return null;
  }
  return selection;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
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

export function AgentChat({
  draft,
  editor,
  selection,
  onClearSelection,
  onClose,
  className,
}: AgentChatProps) {
  const { t, i18n } = useTranslation();

  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [streaming, setStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [toolChips, setToolChips] = useState<ToolChip[]>([]);
  const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
  const [input, setInput] = useState('');
  const [runError, setRunError] = useState<string | null>(null);
  const [mcpTools, setMcpTools] = useState<AgentTool<any>[]>([]);
  const [exaKeyPrompt, setExaKeyPrompt] = useState(false);
  const [exaKeyInput, setExaKeyInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectionExpanded, setSelectionExpanded] = useState(false);

  const agentRef = useRef<Agent | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const latestRef = useRef<AgentSession | null>(null);
  const draftRef = useRef(draft ?? null);
  const editorRef = useRef(editor);
  const contentEditedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionsReadyRef = useRef(false);
  const lastClampedRef = useRef<string | null>(null);
  const selectionRef = useRef(selection);

  useEffect(() => {
    draftRef.current = draft ?? null;
  }, [draft]);

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  useEffect(() => {
    setMcpTools(mcpManager.getTools());
    return mcpManager.subscribe(() => {
      const tools = mcpManager.getTools();
      setMcpTools(tools);
      const agent = agentRef.current;
      if (agent !== null && !agent.state.isStreaming) {
        agent.state.tools = [...buildAgentTools(editorRef.current ?? undefined), ...tools];
      }
    });
  }, []);

  useEffect(
    () =>
      mcpManager.onAuthRequired(serverId => {
        if (serverId === EXA_SERVER_ID) {
          setExaKeyPrompt(true);
        }
      }),
    [],
  );

  const latest = sessions[sessions.length - 1];

  const toolLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of [...buildAgentTools(), ...mcpTools]) {
      map.set(tool.name, tool.label);
    }
    return map;
  }, [mcpTools]);

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
    const withDraft =
      draftNow === null
        ? base
        : `${base}\n\n## Current draft the user is editing\n- slug: ${draftNow.slug}\n- title: ${draftNow.title}\n\n\`\`\`markdown\n${draftNow.content}\n\`\`\`\n\nWhen the user asks something about their draft, answer using this draft. Edits to the draft are staged with update_frontmatter and update_content, and the commit message with set_commit_note; call save when you are done to open the review dialog — the editor is only updated after the user finishes reviewing. When the user is revising a selected chunk, read it with get_selection and return the replacement with update_selection instead of update_content.`;
    return `${withDraft}\n\n${AGENT_GUARDRAIL}`;
  }, []);

  /**
   * The current base prompt: the user's custom override (Settings → Agent) or
   * the built-in i18n prompt, plus the enabled-skills listing. Resolved at use
   * time so edits apply to every session, not just new ones.
   */
  const currentBasePrompt = useCallback((): string => {
    const language = i18n.language?.startsWith('zh') ? 'Chinese' : 'English';
    const base = resolveSystemPrompt(t('agent.systemPrompt', { language }), language);
    const skills = skillsSystemPrompt();
    return skills === '' ? base : `${base}\n\n${skills}`;
  }, [i18n.language, t]);

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
      unsubRef.current?.();
      unsubRef.current = instance.subscribe(event => {
        if (agentRef.current !== instance || latestRef.current?.id !== sessionNow.id) {
          return;
        }
        switch (event.type) {
          case 'agent_start':
            setStreaming(true);
            setRunError(null);
            contentEditedRef.current = false;
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
            if (
              !event.isError &&
              (event.toolName === 'update_content' ||
                event.toolName === 'update_frontmatter' ||
                event.toolName === 'update_selection')
            ) {
              contentEditedRef.current = true;
            }
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
            if (contentEditedRef.current) {
              contentEditedRef.current = false;
              editorRef.current?.openReview();
            }
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
      await syncMcpServersWithTimeout();

      const instance = buildAgent({
        providerId: sessionNow.providerId,
        modelId: sessionNow.modelId,
        systemPrompt: currentBasePrompt(),
        thinkingLevel: sessionNow.thinkingLevel,
        messages: sessionNow.messages,
        sessionId: sessionNow.id,
        editor: editor ?? undefined,
        extraTools: mcpManager.getTools(),
      });
      agentRef.current = instance;
      latestRef.current = sessionNow;
      subscribeAgent(instance, sessionNow);
      return instance;
    },
    [currentBasePrompt, editor, subscribeAgent],
  );

  const handleSaveExaKey = useCallback(async () => {
    setExaApiKey(exaKeyInput);
    setExaKeyInput('');
    setExaKeyPrompt(false);
    await mcpManager.reset();
    await syncMcpServersWithTimeout();
    setMcpTools(mcpManager.getTools());
  }, [exaKeyInput]);

  const createNewSession = useCallback(async (): Promise<AgentSession | null> => {
    const model = defaultModel();
    if (model === undefined) {
      setRunError(t('agent.noModelsHint'));
      return null;
    }
    agentRef.current?.abort();
    const now = Date.now();
    const next: AgentSession = {
      id: newId(),
      title: t('agent.untitled'),
      providerId: model.providerId,
      modelId: model.modelId,
      thinkingLevel: 'low',
      systemPrompt: currentBasePrompt(),
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
  }, [buildForSession, currentBasePrompt, defaultModel, sessions, t]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await refreshModels().catch(() => undefined);
      const all = await listSessionsFull();
      if (cancelled) {
        return;
      }
      all.sort((a, b) => a.updatedAt - b.updatedAt);
      if (all.length > 0) {
        setSessions(all);
      }
      const clamped = clampedSelection(selectionRef.current);
      if (clamped !== null) {
        // A selection is being clamped: always start a fresh conversation so
        // the revision is isolated from whatever was open before, even on the
        // first mount.
        lastClampedRef.current = clamped;
        if (all.length > 0) {
          setCollapsed(new Set(all.map(s => s.id)));
        }
        await createNewSession();
      } else if (all.length > 0) {
        const newest = all[all.length - 1];
        latestRef.current = newest;
        setCollapsed(new Set(all.slice(0, -1).map(s => s.id)));
        await buildForSession(newest);
      } else {
        await createNewSession();
      }
      sessionsReadyRef.current = true;
    })();
    return () => {
      cancelled = true;
      unsubRef.current?.();
      unsubRef.current = null;
      const agent = agentRef.current;
      const session = latestRef.current;
      if (agent !== null && session !== null) {
        void saveSession({
          ...session,
          messages: [...agent.state.messages],
          updatedAt: Date.now(),
        });
      }
      agent?.abort();
      agentRef.current = null;
    };
  }, []);

  // Clamping a selection (the "Clamped selection" chip) always opens a new
  // conversation session, so every revision gets its own thread. The mount
  // case is handled by the initial-load effect above, which consumes the
  // first clamp before setting `sessionsReadyRef`.
  useEffect(() => {
    const clamped = clampedSelection(selection);
    if (clamped === null) {
      lastClampedRef.current = null;
      return;
    }
    if (!sessionsReadyRef.current || clamped === lastClampedRef.current) {
      return;
    }
    lastClampedRef.current = clamped;
    void createNewSession();
  }, [selection, createNewSession]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [sessions, streamingText, toolChips]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el === null) {
      return;
    }
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  useEffect(() => {
    if (selection === null || selection === undefined || selection.trim() === '') {
      setSelectionExpanded(false);
    }
  }, [selection]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if ((text === '' && attachments.length === 0) || streaming) {
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
    instance.state.systemPrompt = buildSystemPrompt(currentBasePrompt());
    const prompt =
      selection !== null && selection !== undefined && selection.trim() !== ''
        ? `Revise the following selection.\n\n\`\`\`markdown\n${selection}\n\`\`\`\n\nInstruction: ${text}`
        : text;
    const sentAttachments = attachments;
    const images = sentAttachments.map(a => ({
      type: 'image' as const,
      data: a.data,
      mimeType: a.mimeType,
    }));
    setInput('');
    setAttachments([]);
    setStreaming(true);
    setRunError(null);
    try {
      if (images.length > 0) {
        await instance.prompt(prompt, images);
      } else {
        await instance.prompt(prompt);
      }
      if (sessionNow.title === t('agent.untitled')) {
        const titleText = text === '' ? (sentAttachments[0]?.name ?? '') : text;
        const title = titleText.slice(0, 40) + (titleText.length > 40 ? '…' : '');
        await persistSession({ ...sessionNow, title }, instance.state.messages);
      }
    } catch (err) {
      setStreaming(false);
      setAttachments(sentAttachments);
      setRunError(err instanceof Error ? err.message : String(err));
    }
  }, [
    attachments,
    buildSystemPrompt,
    createNewSession,
    currentBasePrompt,
    input,
    persistSession,
    selection,
    streaming,
    t,
  ]);

  const allModels = listAvailableModels();
  const activeModel =
    latest !== undefined ? getModel(latest.providerId, latest.modelId) : undefined;
  const visionEnabled = activeModel?.input.includes('image') ?? false;

  const handleStop = useCallback(() => {
    agentRef.current?.abort();
  }, []);

  const insertReference = useCallback((markdown: string) => {
    setInput(prev =>
      prev.trim() === '' ? `${markdown}\n` : `${prev.replace(/\s*$/, '')}\n\n${markdown}\n`,
    );
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el === null) {
        return;
      }
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, []);

  const handleFiles = useCallback(
    async (files: FileList) => {
      const list = Array.from(files);
      if (list.length === 0) {
        return;
      }
      setUploading(true);
      setRunError(null);
      try {
        for (const file of list) {
          const isImage = file.type.startsWith('image/');
          if (isImage && visionEnabled) {
            const blob = await makeVisionImage(file);
            const mimeType = blob.type === '' ? file.type || 'image/png' : blob.type;
            const data = await blobToBase64(blob);
            setAttachments(prev => [...prev, { id: newId(), name: file.name, mimeType, data }]);
            continue;
          }
          const formData = new FormData();
          formData.append('file', file);
          const result = await assetsApi.create(formData);
          const { asset } = result;
          const reference =
            asset.kind === 'image' || asset.kind === 'video'
              ? assetMarkdownLink(asset.name, asset.id, asset.kind)
              : `[${asset.name}](${assetSourceUrl(asset.id, asset.name, asset.kind)})`;
          insertReference(reference);
          if (isImage && !visionEnabled) {
            setRunError(t('agent.uploadImageUnsupported'));
          }
        }
      } catch (err) {
        setRunError(
          t('agent.uploadFailed', {
            detail: err instanceof Error ? err.message : String(err),
          }),
        );
      } finally {
        setUploading(false);
      }
    },
    [insertReference, t, visionEnabled],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
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
      const text = messageText(message);
      const images =
        typeof message.content === 'string'
          ? []
          : message.content.filter(
              (b): b is { type: 'image'; data: string; mimeType: string } => b.type === 'image',
            );
      return (
        <div key={`user-${message.timestamp}-${index}`} className="flex justify-end">
          <div className="max-w-[88%] space-y-1.5 rounded-2xl bg-accent px-3 py-2 text-sm text-accent-foreground">
            {images.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {images.map((img, imgIndex) => (
                  <img
                    key={`${message.timestamp}-img-${imgIndex}`}
                    src={`data:${img.mimeType};base64,${img.data}`}
                    alt=""
                    className="max-h-48 rounded-lg"
                  />
                ))}
              </div>
            )}
            {text !== '' && <p className="whitespace-pre-wrap">{text}</p>}
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
      <div key={`assistant-${message.timestamp}-${index}`} className="flex items-start gap-2">
        <div className="glass-control-opaque mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg">
          <Bot className="size-3.5 text-muted-foreground" />
        </div>
        <div className="min-w-0 max-w-[88%] space-y-1.5">
          {text !== '' && (
            <div className="glass-control-opaque rounded-2xl px-3 py-2">
              <MarkdownView content={text} />
            </div>
          )}
          {calledTools.map(call => {
            const expanded = expandedToolCalls.has(call.id);
            const resultMsg = toolResultMap.get(call.id);
            const hasDetails = resultMsg !== undefined;
            return (
              <div key={call.id}>
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
            <div
              key={s.id}
              className="overflow-hidden rounded-xl border border-border/50 bg-card dark:bg-muted"
            >
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

      <footer className="p-2">
        <form
          onSubmit={event => {
            event.preventDefault();
            void handleSend();
          }}
          className="rounded-2xl border border-input/60 bg-card p-2 transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30 dark:bg-muted"
        >
          {selection !== null && selection !== undefined && selection.trim() !== '' && (
            <div className="mb-1.5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSelectionExpanded(expanded => !expanded)}
                  aria-expanded={selectionExpanded}
                  aria-label={
                    selectionExpanded ? t('agent.selectionCollapse') : t('agent.selectionExpand')
                  }
                  className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-border/50 bg-muted/40 px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Sparkles className="size-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {t('agent.selectionClamped', {
                      preview: selectionPreview(selection),
                      count: selection.length,
                    })}
                  </span>
                  <ChevronDown
                    className={cn(
                      'size-3 shrink-0 transition-transform',
                      selectionExpanded && 'rotate-180',
                    )}
                  />
                </button>
                <button
                  type="button"
                  onClick={onClearSelection}
                  aria-label={t('agent.clearSelection')}
                  className="rounded p-1 text-muted-foreground hover:bg-muted"
                >
                  <X className="size-3" />
                </button>
              </div>
              {selectionExpanded && (
                <div className="mt-1 rounded-lg border border-border/50 bg-muted/30 p-2">
                  <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">
                    {selection.slice(0, SELECTION_PREVIEW_MAX)}
                    {selection.length > SELECTION_PREVIEW_MAX && (
                      <span className="opacity-70">
                        {' '}
                        {t('agent.selectionMore', {
                          count: selection.length - SELECTION_PREVIEW_MAX,
                        })}
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          )}

          {attachments.length > 0 && (
            <div className="mb-1.5 flex flex-wrap gap-1.5">
              {attachments.map(attachment => (
                <div key={attachment.id} className="relative">
                  <img
                    src={`data:${attachment.mimeType};base64,${attachment.data}`}
                    alt={attachment.name}
                    className="size-14 rounded-lg border border-border/50 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={t('agent.removeAttachment')}
                    className="absolute -top-1 -right-1 rounded-full border border-border/60 bg-background p-0.5 text-muted-foreground shadow-sm hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder={t('agent.chatPlaceholder')}
            rows={1}
            className="max-h-40 min-h-9 w-full resize-none border-0 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-50"
          />

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                hidden
                multiple
                accept="image/*,application/pdf,.md,.txt,.doc,.docx"
                onChange={event => {
                  const files = event.target.files;
                  if (files !== null) {
                    void handleFiles(files);
                  }
                  event.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="rounded-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                aria-label={t('agent.upload')}
              >
                {uploading ? <Loader2 className="animate-spin" /> : <Plus />}
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              {streaming && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="rounded-full"
                    aria-label={t('agent.thinkingLevelField')}
                  >
                    <Lightbulb
                      className={cn(
                        'size-3.5',
                        (latest?.thinkingLevel ?? 'off') === 'off' && 'text-muted-foreground/50',
                      )}
                    />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top">
                  <DropdownMenuLabel>{t('agent.thinkingLevelField')}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={latest?.thinkingLevel}
                    onValueChange={value => changeThinking(value as ThinkingLevel)}
                  >
                    {THINKING_LEVELS.map(level => (
                      <DropdownMenuRadioItem key={level} value={level}>
                        {t(`agent.level.${level}`)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 max-w-[14rem] gap-1.5 rounded-full px-2"
                    disabled={allModels.length === 0}
                    aria-label={t('agent.selectModelPlaceholder')}
                  >
                    <Bot className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {activeModel?.name ?? t('agent.selectModelPlaceholder')}
                    </span>
                    {visionEnabled && (
                      <Badge variant="secondary" className="px-1 py-0 text-[0.6rem]">
                        {t('agent.tagVision')}
                      </Badge>
                    )}
                    {activeModel?.reasoning === true && (
                      <Badge variant="secondary" className="px-1 py-0 text-[0.6rem]">
                        {t('agent.tagReasoning')}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" side="top" className="w-64 p-1">
                  <div className="max-h-56 overflow-y-auto">
                    {allModels.map(m => {
                      const selected =
                        m.provider === latest?.providerId && m.model.id === latest.modelId;
                      return (
                        <button
                          key={`${m.provider}::${m.model.id}`}
                          type="button"
                          onClick={() => changeModel(m.provider, m.model.id)}
                          className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted"
                        >
                          <Check className={cn('size-3.5 shrink-0', !selected && 'opacity-0')} />
                          <span className="min-w-0 flex-1 truncate">{m.model.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {m.providerName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
              {streaming ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="rounded-full"
                  onClick={handleStop}
                  aria-label={t('agent.stop')}
                >
                  <Square />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon-sm"
                  className="rounded-full"
                  disabled={
                    (input.trim() === '' && attachments.length === 0) ||
                    allModels.length === 0 ||
                    uploading
                  }
                >
                  <ArrowUp />
                  <span className="sr-only">{t('agent.send')}</span>
                </Button>
              )}
            </div>
          </div>
        </form>
      </footer>

      <Dialog open={exaKeyPrompt} onOpenChange={setExaKeyPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('agent.exaKeyTitle')}</DialogTitle>
            <DialogDescription>{t('agent.exaKeyDescription')}</DialogDescription>
          </DialogHeader>
          <Input
            type="password"
            value={exaKeyInput}
            onChange={event => setExaKeyInput(event.target.value)}
            placeholder={t('agent.exaKeyPlaceholder')}
            autoComplete="off"
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setExaKeyPrompt(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveExaKey()}
              disabled={exaKeyInput.trim() === ''}
            >
              {t('agent.saveKey')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
