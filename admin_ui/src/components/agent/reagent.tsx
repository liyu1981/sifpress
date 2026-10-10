import { cva } from 'class-variance-authority';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

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
import type { EditorMutationBridge } from '@/lib/agent/editor-mutations';
import type { AgentDraft } from '@/lib/agent/types';
import { cn } from '@/lib/utils';

import { ReAgentProvider } from './core/reagent-provider';
import { useReAgent } from './core/hooks';
import {
  ReAgentCloseButton,
  ReAgentHeader,
  ReAgentNewSessionButton,
  ReAgentSessionTreeTrigger,
  ReAgentSettingsTrigger,
} from './ui/reagent-header';
import {
  ReAgentComposer,
  ReAgentComposerAttach,
  ReAgentComposerAttachments,
  ReAgentComposerInput,
  ReAgentComposerRow,
  ReAgentComposerSelectionChip,
  ReAgentComposerStatus,
  ReAgentModelPicker,
  ReAgentSendButton,
  ReAgentThinkingPicker,
} from './ui/reagent-composer';
import { ReAgentMessageList } from './ui/reagent-message-list';
import { ReAgentRoot } from './ui/reagent-root';
import { ReAgentSessionsView } from './ui/reagent-sessions-view';
import { ReAgentSettingsView } from './ui/settings/reagent-settings-view';

export interface ReAgentProps {
  draft?: AgentDraft | null;
  editor?: EditorMutationBridge | null;
  selection?: string | null;
  onClearSelection?: () => void;
  onClose?: () => void;
  /** `glass` (default) is the frosted panel; `solid` is a flat near-white surface. */
  surface?: ReAgentSurface;
  className?: string;
}

export type ReAgentSurface = 'glass' | 'solid';

const surfaceVariants = cva('flex h-full min-h-0 flex-col overflow-hidden rounded-2xl', {
  variants: {
    surface: {
      glass: 'glass-control-opaque',
      // Near-white in light mode, near-black counterpart in dark mode. The
      // `[data-surface='solid']` rule in index.css flattens descendant glass
      // bubbles to match.
      solid:
        'border border-border/70 bg-[#fafafa] shadow-[0_8px_40px_-8px_rgba(0,0,0,0.25)] dark:border-white/10 dark:bg-background dark:shadow-[0_8px_40px_-8px_rgba(0,0,0,0.6)]',
    },
  },
  defaultVariants: { surface: 'glass' },
});

/**
 * The default, styled agent composition. It is only one arrangement of the
 * parts — import `ReAgentProvider` + the `ui/` parts (and `core/hooks`) to
 * build a different one.
 */
export function ReAgent({
  draft,
  editor,
  selection,
  onClearSelection,
  onClose,
  surface,
  className,
}: ReAgentProps) {
  return (
    <ReAgentProvider
      editor={editor}
      draft={draft}
      selection={selection}
      onClearSelection={onClearSelection}
    >
      <ReAgentChrome onClose={onClose} surface={surface} className={className} />
    </ReAgentProvider>
  );
}

function ReAgentChrome({
  onClose,
  surface = 'glass',
  className,
}: {
  onClose?: () => void;
  surface?: ReAgentSurface;
  className?: string;
}) {
  const { view } = useReAgent();
  return (
    <ReAgentRoot data-surface={surface} className={cn(surfaceVariants({ surface }), className)}>
      {view === 'settings' ? (
        <ReAgentSettingsView />
      ) : view === 'sessions' ? (
        <ReAgentSessionsView />
      ) : (
        <>
          <ReAgentHeader>
            <ReAgentSessionTreeTrigger />
            <ReAgentNewSessionButton />
            <ReAgentSettingsTrigger />
            {onClose !== undefined && <ReAgentCloseButton onClick={onClose} />}
          </ReAgentHeader>

          <ReAgentMessageList />

          <footer className="p-2">
            <ReAgentComposer>
              <ReAgentComposerSelectionChip />
              <ReAgentComposerAttachments />
              <ReAgentComposerInput />
              <ReAgentComposerRow>
                <ReAgentComposerAttach />
                <div className="flex items-center gap-1.5">
                  <ReAgentComposerStatus />
                  <ReAgentThinkingPicker />
                  <ReAgentModelPicker />
                  <ReAgentSendButton />
                </div>
              </ReAgentComposerRow>
            </ReAgentComposer>
          </footer>
        </>
      )}

      <ExaKeyDialog />
    </ReAgentRoot>
  );
}

function ExaKeyDialog() {
  const { exaKeyPrompt, setExaKeyPrompt, saveExaKey } = useReAgent();
  const { t } = useTranslation();
  const [key, setKey] = useState('');
  return (
    <Dialog open={exaKeyPrompt} onOpenChange={setExaKeyPrompt}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('agent.exaKeyTitle')}</DialogTitle>
          <DialogDescription>{t('agent.exaKeyDescription')}</DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          value={key}
          onChange={event => setKey(event.target.value)}
          placeholder={t('agent.exaKeyPlaceholder')}
          autoComplete="off"
        />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setExaKeyPrompt(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={() => void saveExaKey(key)} disabled={key.trim() === ''}>
            {t('agent.saveKey')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { AgentDraft };
