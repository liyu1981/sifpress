import { Check, Loader2, RefreshCw, Server } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  EXA_SERVER_ID,
  getExaApiKey,
  listMcpServers,
  type McpServerConfig,
  type McpServerStatus,
  mcpManager,
  saveMcpServers,
  setExaApiKey,
  syncMcpServersWithTimeout,
} from '@/lib/agent/mcp';

export function McpSettingsCard() {
  const { t } = useTranslation();
  const [servers, setServers] = useState<McpServerConfig[]>(() => listMcpServers());
  const [statuses, setStatuses] = useState<McpServerStatus[]>(() => mcpManager.getStatuses());
  const [keyDraft, setKeyDraft] = useState(() => getExaApiKey());
  const [testing, setTesting] = useState(false);

  useEffect(() => mcpManager.subscribe(() => setStatuses(mcpManager.getStatuses())), []);

  const persist = useCallback((next: McpServerConfig[]) => {
    setServers(next);
    saveMcpServers(next);
    setStatuses(mcpManager.getStatuses(next));
  }, []);

  const handleToggle = useCallback(
    async (id: string, enabled: boolean) => {
      persist(servers.map(server => (server.id === id ? { ...server, enabled } : server)));

      if (enabled) {
        await syncMcpServersWithTimeout();
        setStatuses(mcpManager.getStatuses());
      }
    },
    [persist, servers],
  );

  const handleSaveKey = useCallback(async () => {
    setExaApiKey(keyDraft);
    toast.success(t('agent.mcpKeySaved'));
    await mcpManager.reset();
    await syncMcpServersWithTimeout();
    setStatuses(mcpManager.getStatuses());
  }, [keyDraft, t]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    await mcpManager.reset();
    await syncMcpServersWithTimeout();
    setStatuses(mcpManager.getStatuses());
    setTesting(false);
  }, []);

  const statusLabel = (status: McpServerStatus): string => {
    if (status.connecting) {
      return t('agent.mcpConnecting');
    }
    if (status.connected) {
      return t('agent.mcpConnected', { count: status.toolCount });
    }
    if (status.authRequired) {
      return t('agent.mcpAuthRequired');
    }
    if (status.error !== undefined) {
      return t('agent.mcpError');
    }
    return t('agent.mcpDisconnected');
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardAction>
          <Server className="size-5 text-muted-foreground" />
        </CardAction>
        <CardTitle>{t('agent.mcpTitle')}</CardTitle>
        <CardDescription>{t('agent.mcpDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {servers.map(server => {
          const status = statuses.find(candidate => candidate.id === server.id);
          const isExa = server.id === EXA_SERVER_ID;

          return (
            <div key={server.id} className="space-y-2 rounded-xl border border-border/50 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{server.name}</span>
                <Switch
                  checked={server.enabled}
                  onCheckedChange={value => void handleToggle(server.id, value)}
                  aria-label={server.name}
                />
                <span className="ml-auto">
                  {server.enabled && status !== undefined && (
                    <Badge
                      variant={status.connected ? 'secondary' : 'outline'}
                      className="gap-1"
                      title={status.error}
                    >
                      {status.connecting && <Loader2 className="size-3 animate-spin" />}
                      {status.connected && <Check className="size-3" />}
                      {statusLabel(status)}
                    </Badge>
                  )}
                </span>
              </div>

              <p className="font-mono text-xs break-all text-muted-foreground">{server.url}</p>

              {isExa && (
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('agent.mcpExaKeyLabel')}</Label>
                  <div className="flex gap-1.5">
                    <Input
                      type="password"
                      value={keyDraft}
                      onChange={event => setKeyDraft(event.target.value)}
                      placeholder={t('agent.mcpExaKeyPlaceholder')}
                      className="h-8 flex-1"
                      autoComplete="off"
                    />
                    <Button variant="outline" size="sm" onClick={() => void handleSaveKey()}>
                      {t('agent.save')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleTest()}
                      disabled={testing}
                    >
                      {testing ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      {t('agent.mcpTest')}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('agent.mcpExaKeyHint')}</p>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
