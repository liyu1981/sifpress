import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { KvAttrs } from 'ui-sdk';

/** `inspectKey` marks the block with the KV key that fills it (?inspect=1). */
export function LoadingBlock({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-24 text-ink-faint">
      <Loader2 className="size-5 animate-spin" />
      <span className="meta-line">{label}</span>
    </div>
  );
}

export function ErrorBlock({ children }: { children: ReactNode }) {
  return (
    <div className="rule-top-strong mt-12 py-16 text-center">
      <p className="headline-tight text-2xl">Something went wrong</p>
      <p className="dek mx-auto mt-2 max-w-md">{children}</p>
    </div>
  );
}

export function EmptyBlock({
  children,
  inspectKey,
}: {
  children: ReactNode;
  inspectKey?: KvAttrs;
}) {
  return (
    <div {...inspectKey} className="rule-top-strong mt-12 py-20 text-center">
      <p className="headline-tight text-2xl">{children}</p>
    </div>
  );
}
