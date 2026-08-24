import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { usePageTitle } from '@/hooks/use-page-title';
import { useAuth } from 'ui-sdk';
import { kvsApi, sifrontsApi, type SifrontListItem } from 'ui-sdk';

function formatDate(value: string, language: string): string {
  const date = new Date(value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ValueCell({ value }: { value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return <span className="whitespace-pre-wrap break-all text-xs">{text}</span>;
}

function MetaTable({
  meta,
  values,
}: {
  meta: Record<string, unknown> | null;
  values?: Record<string, unknown>;
}) {
  const requireKeys = Array.isArray(meta?.require_keys)
    ? (meta!.require_keys as Record<string, unknown>[])
    : [];

  if (requireKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">No theme keys declared.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="border-b border-border px-2 py-1.5 font-medium">Key</th>
            <th className="border-b border-border px-2 py-1.5 font-medium">Current</th>
            <th className="border-b border-border px-2 py-1.5 font-medium">Default</th>
          </tr>
        </thead>
        <tbody>
          {requireKeys.map((entry) => {
            const entries = Object.entries(entry);
            if (entries.length === 0) {
              return null;
            }
            const [key, def] = entries[0];
            const current = values?.[key];
            return (
              <tr key={key} className="align-top">
                <td className="border-b border-border/60 px-2 py-2 font-mono text-xs">{key}</td>
                <td className="border-b border-border/60 px-2 py-2">
                  {current === undefined ? (
                    <span className="text-xs text-muted-foreground">—</span>
                  ) : (
                    <ValueCell value={current} />
                  )}
                </td>
                <td className="border-b border-border/60 px-2 py-2 text-muted-foreground">
                  <ValueCell value={def} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SifrontCard({
  sf,
  canManage,
  activate,
  remove,
}: {
  sf: SifrontListItem;
  canManage: boolean;
  activate: UseMutationResult<unknown, unknown, number>;
  remove: UseMutationResult<unknown, unknown, number>;
}) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(sf.is_active);

  const detail = useQuery({
    queryKey: ['sifront', sf.id],
    queryFn: () => sifrontsApi.get(sf.id),
    enabled: expanded,
  });

  const requireKeys = (detail.data?.meta?.require_keys ?? []) as Record<string, unknown>[];
  const keys = requireKeys
    .map((entry) => (entry !== null && typeof entry === 'object' ? Object.keys(entry)[0] : ''))
    .filter((key): key is string => typeof key === 'string' && key !== '');

  const values = useQuery({
    queryKey: ['sifront-values', sf.id],
    queryFn: () => kvsApi.getMany(keys),
    enabled: expanded && keys.length > 0,
  });

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {sf.name}
          {sf.is_active && <Badge variant="default">{t('sifront.active')}</Badge>}
        </CardTitle>
        <CardDescription>
          {t('sifront.version', { version: sf.version })} ·{' '}
          {formatDate(sf.updated_at, i18n.language)}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          {sf.is_active && (
            <Button asChild variant="outline" size="sm">
              <a href={window.location.pathname} target="_blank" rel="noopener noreferrer">
                <Eye className="size-4" />
                {t('sifront.preview')}
              </a>
            </Button>
          )}
          {canManage && (
            <>
              {!sf.is_active && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => activate.mutate(sf.id)}
                  disabled={activate.isPending}
                >
                  {activate.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    t('sifront.activate')
                  )}
                </Button>
              )}
              {!sf.is_active && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (window.confirm(t('sifront.deleteConfirm', { name: sf.name }))) {
                      remove.mutate(sf.id);
                    }
                  }}
                  disabled={remove.isPending}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded((e) => !e)}
            aria-label={expanded ? 'Collapse' : 'Expand'}
          >
            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </Button>
        </CardAction>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          {detail.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading…
            </div>
          ) : (
            <MetaTable meta={detail.data?.meta ?? null} values={values.data?.data} />
          )}
        </CardContent>
      )}
    </Card>
  );
}

export function SifrontsPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.permissions?.includes('settings.manage') ?? false;

  usePageTitle(t('sifront.title'));

  const list = useQuery({
    queryKey: ['sifronts'],
    queryFn: sifrontsApi.list,
  });

  const activate = useMutation({
    mutationFn: (id: number) => sifrontsApi.activate(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sifronts'] }),
  });

  const remove = useMutation({
    mutationFn: (id: number) => sifrontsApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['sifronts'] }),
  });

  const sifronts = list.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('sifront.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('sifront.description')}</p>
        </div>
        {canManage && (
          <Button size="sm">
            <Plus className="mr-1 size-4" />
            {t('sifront.new')}
          </Button>
        )}
      </div>

      {list.isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!list.isLoading && sifronts.length === 0 && (
        <Card size="sm">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t('sifront.empty')}
          </CardContent>
        </Card>
      )}

      {sifronts.map((sf: SifrontListItem) => (
        <SifrontCard
          key={sf.id}
          sf={sf}
          canManage={canManage}
          activate={activate}
          remove={remove}
        />
      ))}
    </div>
  );
}
