import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { systemApi } from 'ui-sdk';
import { ImageOptimizeDialog } from '@/components/image-optimize-dialog';

/** Images above this size are pre-ticked for optimization in the queue. */
export const OPTIMIZE_DEFAULT_THRESHOLD_BYTES = 500 * 1024;

/** Whether a picked file should offer optimization by default. */
export function shouldOptimizeByDefault(file: File): boolean {
  return file.type.startsWith('image/') && file.size > OPTIMIZE_DEFAULT_THRESHOLD_BYTES;
}

interface OptimizeRequest {
  file: File;
  limitBytes: number;
  resolve: (file: File | null) => void;
  /** File to resolve with when the dialog is dismissed. */
  skip: File | null;
}

interface EnsureOptions {
  /** Offer optimization even when the file is already within the limit. */
  optional?: boolean;
}

/**
 * Gate an image upload on the configured size limit. An image within the
 * limit passes through untouched unless `optional` is set, in which case the
 * dialog is offered and dismissing it uploads the original. Images over the
 * limit always open the dialog; dismissing it skips the file (resolves null).
 * Render `optimizeDialog` once in the host component.
 */
export function useImageOptimize() {
  const systemQuery = useQuery({
    queryKey: ['system', 'status'],
    queryFn: systemApi.status,
    staleTime: 60_000,
  });
  const limitBytes = systemQuery.data?.asset_limits.image_max_bytes;
  const [request, setRequest] = useState<OptimizeRequest | null>(null);

  const ensureWithinLimit = useCallback(
    (file: File, options?: EnsureOptions): Promise<File | null> => {
      const optional = options?.optional === true;

      if (limitBytes === undefined || !file.type.startsWith('image/')) {
        return Promise.resolve(file);
      }

      const overLimit = file.size > limitBytes;

      if (!overLimit && !optional) {
        return Promise.resolve(file);
      }

      return new Promise<File | null>(resolve => {
        setRequest({
          file,
          limitBytes,
          resolve,
          skip: optional && !overLimit ? file : null,
        });
      });
    },
    [limitBytes],
  );

  const optimizeDialog =
    request !== null ? (
      <ImageOptimizeDialog
        open
        file={request.file}
        limitBytes={request.limitBytes}
        onOpenChange={open => {
          if (!open) {
            request.resolve(request.skip);
            setRequest(null);
          }
        }}
        onConfirm={file => {
          request.resolve(file);
          setRequest(null);
        }}
      />
    ) : null;

  return { ensureWithinLimit, optimizeDialog, imageLimitBytes: limitBytes };
}
