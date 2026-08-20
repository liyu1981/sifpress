import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { AmbientBackground } from '@/components/ambient-background';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { migrationApi } from 'ui-sdk';

/**
 * Full-screen maintenance view shown when the database schema is behind
 * the embedded migrations. Runs ?p=sifpress/migration&action=run, then
 * reloads. Public by design — a fresh install has no users yet.
 */
export function MigrationScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const status = useQuery({
    queryKey: ['migration', 'status'],
    queryFn: migrationApi.status,
    staleTime: 30_000,
  });

  const run = useMutation({
    mutationFn: migrationApi.run,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['migration', 'status'] });
      queryClient.invalidateQueries({ queryKey: ['system', 'status'] });
      window.location.reload();
    },
  });

  const pending = (status.data?.migrations ?? []).filter(m => !m.applied);

  return (
    <div className="ambient-bg min-h-screen w-full">
      <AmbientBackground />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <div className="glass-control w-full max-w-md rounded-2xl p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Database className="size-6" />
            </div>
            <div className="space-y-1">
              <Badge>{t('migration.badge')}</Badge>
              <h1 className="font-heading text-2xl font-bold tracking-tight">
                {t('migration.title')}
              </h1>
              <p className="text-sm text-muted-foreground">{t('migration.description')}</p>
            </div>

            {status.isLoading ? (
              <p className="text-sm text-muted-foreground">{t('migration.checking')}</p>
            ) : (
              <ul className="w-full space-y-1.5 text-sm">
                {pending.map(m => (
                  <li
                    key={m.version}
                    className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2"
                  >
                    <code className="font-mono text-xs">{m.version}</code>
                    <span className="text-xs text-muted-foreground">{t('migration.pending')}</span>
                  </li>
                ))}
              </ul>
            )}

            <Button className="w-full" onClick={() => run.mutate()} disabled={run.isPending}>
              {run.isPending && <Loader2 className="animate-spin" />}
              {run.isPending ? t('migration.running') : t('migration.run')}
            </Button>

            {run.isError && <p className="text-sm text-destructive">{t('migration.error')}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
