import { RotateCcw, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  clearCustomSystemPrompt,
  getCustomSystemPrompt,
  setCustomSystemPrompt,
} from '@/lib/agent/prompt';

export function SystemPromptSettingsCard() {
  const { t, i18n } = useTranslation();
  const language = i18n.language?.startsWith('zh') ? 'Chinese' : 'English';
  const [value, setValue] = useState(() => getCustomSystemPrompt());

  const handleSave = () => {
    setCustomSystemPrompt(value);
    setValue(getCustomSystemPrompt());
    toast.success(
      value.trim() === '' ? t('agent.customPromptCleared') : t('agent.customPromptSaved'),
    );
  };

  const handleReset = () => {
    clearCustomSystemPrompt();
    setValue('');
    toast.success(t('agent.customPromptCleared'));
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardAction>
          <ScrollText className="size-5 text-muted-foreground" />
        </CardAction>
        <CardTitle>{t('agent.customPromptTitle')}</CardTitle>
        <CardDescription>{t('agent.customPromptDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <textarea
          value={value}
          onChange={event => setValue(event.target.value)}
          placeholder={t('agent.customPromptPlaceholder')}
          rows={8}
          spellCheck={false}
          className="min-h-32 w-full resize-y rounded-xl border border-input bg-background p-3 font-mono text-xs leading-5 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <p className="text-xs text-muted-foreground">
          {t('agent.customPromptHint', { token: '{{language}}' })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={handleSave}>
            {t('agent.save')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setValue(t('agent.systemPrompt', { language }))}
          >
            {t('agent.customPromptLoadDefault')}
          </Button>
          <Button size="sm" variant="ghost" onClick={handleReset}>
            <RotateCcw />
            {t('agent.customPromptReset')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
