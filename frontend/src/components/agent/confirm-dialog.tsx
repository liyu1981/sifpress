import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ConfirmRequest } from '@/lib/agent/confirm';
import { Check } from 'lucide-react';

export function ConfirmDialog({
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
