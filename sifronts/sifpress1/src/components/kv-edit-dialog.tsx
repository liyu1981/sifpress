import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ApiError, kvsApi, type KvPair } from 'ui-sdk';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useKvEditAccess } from '@/lib/kv-editor';

type ValueMode = 'text' | 'json';

interface KvEditDialogProps {
  kvKey: string;
  existing: KvPair | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KvEditDialog({ kvKey, existing, open, onOpenChange }: KvEditDialogProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<ValueMode>('text');
  const [text, setText] = useState('');
  const [json, setJson] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const value = existing?.value;

    if (typeof value === 'string') {
      setMode('text');
      setText(value);
      setJson(JSON.stringify(value, null, 2));
    } else if (value === undefined || value === null) {
      setMode('text');
      setText('');
      setJson('');
    } else {
      setMode('json');
      setText('');
      setJson(JSON.stringify(value, null, 2));
    }

    setError(null);
  }, [open, existing]);

  const save = useMutation({
    mutationFn: () => {
      let value: unknown;

      if (mode === 'text') {
        value = text;
      } else {
        try {
          value = JSON.parse(json);
        } catch {
          throw new ApiError(422, { error: 'The value must be valid JSON.' });
        }
      }

      return existing !== null
        ? kvsApi.update({ key: kvKey, value })
        : kvsApi.create({ key: kvKey, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['theme-config'] });
      queryClient.invalidateQueries({ queryKey: ['kv-edit', kvKey] });
      onOpenChange(false);
    },
    onError: err => {
      setError(err instanceof ApiError ? (err.data.error ?? 'Could not save.') : 'Could not save.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{existing !== null ? 'Edit key-value' : 'Create key-value'}</DialogTitle>
          <DialogDescription>
            Stored in the key-value store and rendered by this theme. Text is saved as a single JSON
            string, so HTML needs no escaping.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Key</p>
            <code className="block break-all rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 font-mono text-xs">
              {kvKey}
            </code>
          </div>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Value</p>
            <div className="flex items-center gap-0.5 rounded-lg border border-border/60 p-0.5">
              <Button
                type="button"
                size="xs"
                variant={mode === 'text' ? 'secondary' : 'ghost'}
                onClick={() => setMode('text')}
              >
                Text
              </Button>
              <Button
                type="button"
                size="xs"
                variant={mode === 'json' ? 'secondary' : 'ghost'}
                onClick={() => setMode('json')}
              >
                JSON
              </Button>
            </div>
          </div>

          {mode === 'text' ? (
            <Textarea
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="Paste text or HTML — saved as a single string."
              className="h-80"
              autoFocus
            />
          ) : (
            <Textarea
              value={json}
              onChange={event => setJson(event.target.value)}
              placeholder='{"key": "value"}'
              className="h-80"
              autoFocus
            />
          )}

          {error !== null && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="animate-spin" />}
            {existing !== null ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function KvEditButton({
  kvKey,
  label,
  className,
}: {
  kvKey: string;
  label?: string;
  className?: string;
}) {
  const { canEdit, existing } = useKvEditAccess(kvKey);
  const [open, setOpen] = useState(false);

  if (!canEdit) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={label !== undefined ? 'sm' : 'icon-sm'}
        onClick={() => setOpen(true)}
        className={className}
        aria-label={`Edit ${kvKey}`}
      >
        <Pencil />
        {label}
      </Button>
      <KvEditDialog kvKey={kvKey} existing={existing} open={open} onOpenChange={setOpen} />
    </>
  );
}
