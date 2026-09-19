import { useQuery } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { systemApi } from 'ui-sdk';
import { ImageOptimizeDialog } from '@/components/image-optimize-dialog';

interface OptimizeRequest {
  file: File;
  limitBytes: number;
  resolve: (file: File | null) => void;
}

/**
 * Gate an image upload on the configured size limit. Within the limit (or for
 * non-images) the file passes through untouched; otherwise a dialog offers
 * local resize/desample methods and resolves with the optimized file, or null
 * when the user skips it. Render `optimizeDialog` once in the host component.
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
    (file: File): Promise<File | null> => {
      if (limitBytes === undefined || !file.type.startsWith('image/') || file.size <= limitBytes) {
        return Promise.resolve(file);
      }
      return new Promise<File | null>(resolve => {
        setRequest({ file, limitBytes, resolve });
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
            request.resolve(null);
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
