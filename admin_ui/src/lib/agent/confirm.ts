export interface ConfirmRequest {
  kind: 'create' | 'update';
  summary: string;
  detail: string;
  resolve: (ok: boolean) => void;
}

let handler: ((request: ConfirmRequest) => void) | null = null;

export function setConfirmHandler(fn: ((request: ConfirmRequest) => void) | null): void {
  handler = fn;
}

/**
 * Blocks the calling tool until the UI resolves the confirmation. Returns
 * false when no handler is registered, so write tools fail safe.
 */
export function requestConfirm(
  kind: 'create' | 'update',
  summary: string,
  detail: string,
): Promise<boolean> {
  return new Promise(resolve => {
    if (handler === null) {
      resolve(false);
      return;
    }
    handler({ kind, summary, detail, resolve });
  });
}
