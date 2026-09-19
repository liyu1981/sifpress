import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Eye, Loader2, Plus, Trash2 } from 'lucide-react';
import { type ChangeEvent, useRef, useState } from 'react';
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
import { usePageTitle } from '@/hooks/use-page-title';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from 'ui-sdk';
import { appBaseUrl, kvsApi, sifrontsApi, type SifrontListItem } from 'ui-sdk';
import { formatTimestamp } from '@/lib/format';

function ValueCell({ value }: { value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return <span className="whitespace-pre-wrap break-all text-xs">{text}</span>;
}

/** Read the sifront's <meta name="sifront_meta"> payload, if the bundle has one. */
function parseSifrontMeta(html: string): Record<string, unknown> | undefined {
  try {
    const content = new DOMParser()
      .parseFromString(html, 'text/html')
      .querySelector('meta[name="sifront_meta"]')
      ?.getAttribute('content');

    if (content === null || content === undefined || content === '') {
      return undefined;
    }

    const parsed: unknown = JSON.parse(content);

    return parsed !== null && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Derive a display name from the uploaded file name, falling back to <title>. */
function sifrontNameFromFile(fileName: string, html: string): string {
  const base = fileName.replace(/\.(sifront|html?)$/i, '').trim();

  if (base !== '') {
    return base;
  }

  const title = new DOMParser()
    .parseFromString(html, 'text/html')
    .querySelector('title')
    ?.textContent?.trim();

  return title !== undefined && title !== '' ? title : 'Sifront';
}

function MetaTable({
  meta,
  values,
}: {
  meta: Record<string, unknown> | null;
  values?: Record<string, unknown>;
}) {
  const requireKeys: Record<string, unknown>[] =
    meta !== null && Array.isArray(meta.require_keys)
      ? (meta.require_keys as Record<string, unknown>[])
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
          {requireKeys.map(entry => {
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  const detail = useQuery({
    queryKey: ['sifront', sf.id],
    queryFn: () => sifrontsApi.get(sf.id),
    enabled: expanded,
  });

  const requireKeys = (detail.data?.meta?.require_keys ?? []) as Record<string, unknown>[];
  const keys = requireKeys
    .map(entry => (entry !== null && typeof entry === 'object' ? Object.keys(entry)[0] : ''))
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
          {formatTimestamp(sf.updated_at, i18n.language)}
        </CardDescription>
        <CardAction className="flex items-center gap-2">
          {sf.is_active && (
            <Button asChild variant="outline" size="sm">
              <a href={appBaseUrl()} target="_blank" rel="noopener noreferrer">
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
                  onClick={() => setConfirmDelete(true)}
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
            onClick={() => setExpanded(e => !e)}
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
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('sifront.deleteConfirm', { name: sf.name })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => remove.mutate(sf.id)}
      />
    </Card>
  );
}

export function SifrontsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canManage = user?.permissions?.includes('settings.manage') ?? false;

  usePageTitle(t('sifront.title'));

  const list = useQuery({
    queryKey: ['sifronts'],
    queryFn: sifrontsApi.list,
  });

  const create = useMutation({
    mutationFn: (input: { name: string; content: string; meta?: Record<string, unknown> }) =>
      sifrontsApi.create(input),
    onSuccess: sf => {
      queryClient.invalidateQueries({ queryKey: ['sifronts'] });
      toast.success(t('sifront.created', { name: sf.name }));
    },
    onError: error => {
      toast.error(
        t('sifront.uploadFailed', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    },
  });

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so the same file can be picked again after a failure.
    event.target.value = '';

    if (file === undefined) {
      return;
    }

    try {
      const content = await file.text();

      if (content.trim() === '') {
        toast.error(t('sifront.uploadFailed', { detail: 'empty file' }));
        return;
      }

      create.mutate({
        name: sifrontNameFromFile(file.name, content),
        content,
        meta: parseSifrontMeta(content),
      });
    } catch (error) {
      toast.error(
        t('sifront.uploadFailed', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  };

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
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={create.isPending}>
            {create.isPending ? (
              <Loader2 className="mr-1 size-4 animate-spin" />
            ) : (
              <Plus className="mr-1 size-4" />
            )}
            {t('sifront.new')}
          </Button>
        )}
        {/* Hidden picker: a built `.sifront` (or html) bundle becomes a new sifront. */}
        <input
          ref={fileRef}
          type="file"
          accept=".sifront,.html,text/html"
          className="hidden"
          onChange={event => void handleFile(event)}
        />
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
