import { Check, Loader2, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  type ImageOptimization,
  type LoadedImage,
  loadImageForOptimization,
  planImageOptimizations,
  renderImageOptimization,
} from 'ui-sdk';

interface Estimate {
  status: 'pending' | 'done' | 'error';
  blob: Blob | null;
}

interface ImageOptimizeDialogProps {
  open: boolean;
  file: File;
  limitBytes: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: (file: File) => void;
}

const EXTENSIONS: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

function renameForMime(name: string, mime: string): string {
  const ext = EXTENSIONS[mime];
  if (ext === undefined) {
    return name;
  }
  const base = name.replace(/\.[^./\\]+$/, '');
  return `${base}.${ext}`;
}

/**
 * Yield to the event loop so a long optimization pass (decode + encode several
 * candidates) never freezes the dialog. Uses the scheduler API when present.
 */
function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: { yield?: () => Promise<void> } }).scheduler;
  if (typeof scheduler?.yield === 'function') {
    return scheduler.yield();
  }
  return new Promise(resolve => {
    window.setTimeout(resolve, 0);
  });
}

/**
 * Dialog shown when a picked image is over the upload limit. It proposes local
 * resize/desample methods, estimates the resulting size for each without
 * blocking the UI, and only uploads after the user confirms a method.
 */
function ImageOptimizeDialog({
  open,
  file,
  limitBytes,
  onOpenChange,
  onConfirm,
}: ImageOptimizeDialogProps) {
  const { t } = useTranslation();
  const withinLimit = file.size <= limitBytes;
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [plans, setPlans] = useState<ImageOptimization[]>([]);
  const [estimates, setEstimates] = useState<Record<string, Estimate>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const loadedRef = useRef<LoadedImage | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    setLoading(true);
    setFailed(false);
    setDimensions(null);
    setPlans([]);
    setEstimates({});
    setSelectedId(null);

    void (async () => {
      let loaded: LoadedImage;

      try {
        loaded = await loadImageForOptimization(file);
      } catch {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
        return;
      }

      if (cancelled) {
        loaded.dispose();
        return;
      }

      loadedRef.current = loaded;
      const nextPlans = planImageOptimizations(loaded.width, loaded.height);
      setDimensions({ width: loaded.width, height: loaded.height });
      setPlans(nextPlans);
      setEstimates(
        Object.fromEntries(
          nextPlans.map(plan => [plan.id, { status: 'pending' as const, blob: null }]),
        ),
      );
      setLoading(false);

      for (const plan of nextPlans) {
        if (cancelled) {
          return;
        }
        await yieldToMain();
        try {
          const { blob } = await renderImageOptimization(loaded, plan);
          if (cancelled) {
            return;
          }
          setEstimates(prev => ({ ...prev, [plan.id]: { status: 'done', blob } }));
        } catch {
          if (cancelled) {
            return;
          }
          setEstimates(prev => ({ ...prev, [plan.id]: { status: 'error', blob: null } }));
        }
      }
    })();

    return () => {
      cancelled = true;
      loadedRef.current?.dispose();
      loadedRef.current = null;
    };
  }, [open, file]);

  useEffect(() => {
    if (selectedId !== null) {
      return;
    }
    const fitting = plans.find(plan => {
      const estimate = estimates[plan.id];
      return (
        estimate?.status === 'done' && estimate.blob !== null && estimate.blob.size <= limitBytes
      );
    });
    if (fitting !== undefined) {
      setSelectedId(fitting.id);
    }
  }, [estimates, plans, selectedId, limitBytes]);

  const selected = selectedId !== null ? estimates[selectedId] : undefined;
  const selectedBlob = selected?.status === 'done' ? selected.blob : null;

  useEffect(() => {
    if (selectedBlob === null) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedBlob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedBlob]);

  const recommendedId =
    plans.find(plan => {
      const estimate = estimates[plan.id];
      return (
        estimate?.status === 'done' && estimate.blob !== null && estimate.blob.size <= limitBytes
      );
    })?.id ?? null;

  const allSettled =
    plans.length > 0 && plans.every(plan => estimates[plan.id]?.status !== 'pending');
  const canConfirm =
    selected?.status === 'done' && selected.blob !== null && selected.blob.size <= limitBytes;

  function handleConfirm() {
    if (selected?.status !== 'done' || selected.blob === null) {
      return;
    }
    const mime = selected.blob.type || 'image/webp';
    onConfirm(new File([selected.blob], renameForMime(file.name, mime), { type: mime }));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-control-opaque max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {withinLimit ? t('assets.optimizeTitleOptional') : t('assets.optimizeTitle')}
          </DialogTitle>
          <DialogDescription>
            {withinLimit
              ? t('assets.optimizeDescriptionOptional', {
                  name: file.name,
                  size: formatBytes(file.size),
                  limit: formatBytes(limitBytes),
                })
              : t('assets.optimizeDescription', {
                  name: file.name,
                  size: formatBytes(file.size),
                  limit: formatBytes(limitBytes),
                })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
          {previewUrl !== null && (
            <img
              src={previewUrl}
              alt=""
              className="size-12 shrink-0 rounded-lg border border-border/60 object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">{file.name}</p>
            <p>
              {dimensions !== null
                ? t('assets.optimizeOriginal', {
                    width: dimensions.width,
                    height: dimensions.height,
                    size: formatBytes(file.size),
                  })
                : formatBytes(file.size)}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('assets.optimizeLoading')}
          </div>
        ) : failed ? (
          <p className="py-8 text-center text-sm text-destructive">{t('assets.optimizeFailed')}</p>
        ) : (
          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {plans.map(plan => {
              const estimate = estimates[plan.id];
              const blob = estimate?.status === 'done' ? estimate.blob : null;
              const underLimit = blob !== null && blob.size <= limitBytes;
              const saved =
                blob !== null && file.size > 0 ? Math.round((1 - blob.size / file.size) * 100) : 0;
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedId(plan.id)}
                  disabled={estimate?.status === 'error'}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-50',
                    selectedId === plan.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border/70 hover:bg-muted/50',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-4 shrink-0 items-center justify-center rounded-full border',
                      selectedId === plan.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-muted-foreground/40',
                    )}
                  >
                    {selectedId === plan.id && <Check className="size-3" />}
                  </span>
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {plan.mode === 'resize'
                        ? t('assets.optimizeResize')
                        : t('assets.optimizeDesample')}
                      {plan.id === recommendedId && (
                        <Badge variant="secondary" className="gap-1">
                          <Sparkles className="size-3" />
                          {t('assets.optimizeRecommended')}
                        </Badge>
                      )}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {t('assets.optimizeTarget', {
                        width: plan.width,
                        height: plan.height,
                        quality: Math.round(plan.quality * 100),
                      })}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    {estimate?.status === 'pending' ? (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Loader2 className="size-3 animate-spin" />
                        {t('assets.optimizeCalculating')}
                      </span>
                    ) : estimate?.status === 'error' || blob === null ? (
                      <span className="text-destructive">{t('assets.optimizeFailed')}</span>
                    ) : (
                      <>
                        <span className="block font-medium">{formatBytes(blob.size)}</span>
                        <span
                          className={cn(
                            'block',
                            underLimit ? 'text-emerald-600' : 'text-amber-600',
                          )}
                        >
                          {saved >= 0
                            ? t('assets.optimizeSaving', { percent: saved })
                            : t('assets.optimizeGrowth', { percent: Math.abs(saved) })}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              );
            })}

            {allSettled && recommendedId === null && (
              <p className="pt-1 text-center text-xs text-amber-600">
                {t('assets.optimizeNoOptions')}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {withinLimit ? t('assets.optimizeUploadOriginal') : t('assets.optimizeCancel')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canConfirm}>
            {t('assets.optimizeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { ImageOptimizeDialog };
