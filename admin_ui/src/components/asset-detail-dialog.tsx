import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Loader2, Trash2, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatBytes, formatTimestamp } from '@/lib/format';
import { cn } from '@/lib/utils';
import { ApiError, type Asset, assetSourceUrl, assetsApi, copyText } from 'ui-sdk';

function Meta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn('text-right break-all', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

/**
 * Asset lightbox: full preview, metadata, and the effective editor list. Users
 * who can edit the asset (uploader, admin, or grant) can add/remove grants.
 */
export function AssetDetailDialog({
  asset,
  onOpenChange,
}: {
  asset: Asset | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  const open = asset !== null;
  const assetId = asset?.id ?? 0;
  const grantsKey = ['asset-grants', assetId];

  const grants = useQuery({
    queryKey: grantsKey,
    queryFn: () => assetsApi.grants(assetId),
    enabled: open,
  });

  const grant = useMutation({
    mutationFn: (name: string) => assetsApi.grant(assetId, name),
    onSuccess: () => {
      setUsername('');
      setError(null);
      queryClient.invalidateQueries({ queryKey: grantsKey });
    },
    onError: err => {
      setError(
        err instanceof ApiError
          ? (err.data.error ?? t('assets.grantError'))
          : t('assets.grantError'),
      );
    },
  });

  const revoke = useMutation({
    mutationFn: (name: string) => assetsApi.revokeGrant(assetId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: grantsKey }),
    onError: err => {
      setError(
        err instanceof ApiError
          ? (err.data.error ?? t('assets.grantError'))
          : t('assets.grantError'),
      );
    },
  });

  async function copyUrl(): Promise<void> {
    if (asset === null) {
      return;
    }

    const url = assetSourceUrl(asset.id, asset.name, asset.kind);

    if (await copyText(url)) {
      toast.success(t('assets.copyUrl'));
    } else {
      toast.error(t('assets.copyUrl'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-popover [background-image:none] sm:max-w-3xl">
        {asset !== null && (
          <>
            <DialogHeader>
              <DialogTitle className="truncate pr-8">{asset.name}</DialogTitle>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center justify-center rounded-xl border border-border/60 bg-muted/30 p-2">
                {asset.kind === 'video' ? (
                  <video
                    src={assetSourceUrl(asset.id, asset.name, asset.kind)}
                    controls
                    className="max-h-72 w-full rounded-lg"
                  />
                ) : (
                  <img
                    src={assetSourceUrl(asset.id, asset.name, asset.kind)}
                    alt={asset.name}
                    className="max-h-72 w-full rounded-lg object-contain"
                  />
                )}
              </div>

              <div className="space-y-3">
                <dl className="space-y-2 text-sm">
                  <Meta label={t('assets.detailKind')} value={asset.kind} />
                  <Meta label={t('assets.detailMime')} value={asset.mime} />
                  <Meta label={t('assets.detailSize')} value={formatBytes(asset.size_bytes)} />
                  {asset.width !== null && asset.height !== null && (
                    <Meta
                      label={t('assets.detailDimensions')}
                      value={`${asset.width}×${asset.height}`}
                    />
                  )}
                  {asset.duration !== null && (
                    <Meta
                      label={t('assets.detailDuration')}
                      value={`${asset.duration.toFixed(1)}s`}
                    />
                  )}
                  {asset.md5 !== null && (
                    <Meta label={t('assets.detailMd5')} value={asset.md5} mono />
                  )}
                  <Meta
                    label={t('assets.detailUploadedBy')}
                    value={asset.uploaded_by_name || '—'}
                  />
                  <Meta
                    label={t('assets.detailCreated')}
                    value={formatTimestamp(asset.created_at, i18n.language)}
                  />
                  <Meta
                    label={t('assets.detailVisibility')}
                    value={asset.is_public ? t('assets.public') : t('assets.private')}
                  />
                </dl>

                <Button type="button" variant="outline" size="sm" onClick={() => void copyUrl()}>
                  <Copy />
                  {t('assets.copyUrl')}
                </Button>
              </div>
            </div>

            <div className="space-y-3 border-t border-border/60 pt-4">
              <Label>{t('assets.editorsTitle')}</Label>
              <p className="text-xs text-muted-foreground">{t('assets.editorsHint')}</p>

              {grants.isLoading ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  {t('assets.loading')}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {(grants.data ?? []).map(item => (
                    <li
                      key={item.username}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="font-mono text-xs">{item.username}</span>
                        {item.name !== '' && (
                          <span className="ml-2 text-xs text-muted-foreground">{item.name}</span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">{t(`assets.editorKind.${item.kind}`)}</Badge>
                        {asset.can_edit && item.kind === 'grant' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="text-destructive"
                            aria-label={t('assets.revokeGrant')}
                            title={t('assets.revokeGrant')}
                            onClick={() => revoke.mutate(item.username)}
                            disabled={revoke.isPending}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {asset.can_edit && (
                <div className="flex items-end gap-2">
                  <Input
                    value={username}
                    onChange={event => setUsername(event.target.value)}
                    placeholder={t('assets.grantPlaceholder')}
                    onKeyDown={event => {
                      if (event.key === 'Enter' && username.trim() !== '') {
                        event.preventDefault();
                        grant.mutate(username.trim());
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => grant.mutate(username.trim())}
                    disabled={grant.isPending || username.trim() === ''}
                  >
                    {grant.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
                    {t('assets.grantAction')}
                  </Button>
                </div>
              )}

              {error !== null && <p className="text-sm text-destructive">{error}</p>}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
