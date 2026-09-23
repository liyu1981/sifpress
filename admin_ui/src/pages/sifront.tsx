import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Eye,
  Loader2,
  Maximize2,
  Plus,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { usePageTitle } from '@/hooks/use-page-title';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from 'ui-sdk';
import { appBaseUrl, kvsApi, sifrontsApi, type SifrontListItem } from 'ui-sdk';
import { formatTimestamp } from '@/lib/format';
import { readSifrontBundle, compareVersions, type SifrontBundle } from '@/lib/sifront-bundle';

function ValueCell({ value }: { value: unknown }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return <span className="whitespace-pre-wrap break-all text-xs">{text}</span>;
}

/** Render a KV value for display / as the default string in an editor. */
function stringifyValue(value: unknown): string {
  if (value === undefined) {
    return '';
  }

  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Parse an edited value: valid JSON becomes its parsed form (number, boolean,
 * array, object), anything else stays the literal string the user typed.
 */
function parseValue(input: string): unknown {
  const trimmed = input.trim();

  if (trimmed === '') {
    return '';
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return input;
  }
}

/**
 * Extract the per-key example strings a sifront declares under meta.examples,
 * used as hints in the value editor dialog.
 */
function themeExamples(meta: Record<string, unknown> | null): Record<string, string> {
  const raw = meta?.examples;

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }

  const out: Record<string, string> = {};

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value !== '') {
      out[key] = value;
    }
  }

  return out;
}

/**
 * Larger editor for one theme key, opened from the expand icon in the row.
 * It edits the row's draft so the inline input and the dialog stay in sync;
 * Save persists the value (valid JSON is parsed, anything else stays text).
 */
function ValueEditorDialog({
  open,
  onOpenChange,
  keyName,
  value,
  example,
  canEdit,
  saving,
  onChange,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyName: string;
  value: string;
  example?: string;
  canEdit: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-control-opaque max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm break-all">{keyName}</DialogTitle>
          <DialogDescription>{t('sifront.valueDialogDescription')}</DialogDescription>
        </DialogHeader>
        <Textarea
          value={value}
          onChange={event => onChange(event.target.value)}
          readOnly={!canEdit}
          placeholder="—"
          aria-label={keyName}
          className="h-[50vh] font-mono text-sm"
          autoFocus
        />
        {example !== undefined && (
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {t('sifront.valueExample')}
              </span>
              {canEdit && (
                <Button type="button" variant="ghost" size="xs" onClick={() => onChange(example)}>
                  {t('sifront.useExample')}
                </Button>
              )}
            </div>
            <pre className="max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-xs whitespace-pre-wrap text-muted-foreground">
              {example}
            </pre>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {canEdit ? t('common.cancel') : t('common.close')}
          </Button>
          {canEdit && (
            <Button type="button" size="sm" disabled={saving} onClick={onSave}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {t('sifront.saveValue')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One editable key row: edit the input, then press the Save button that appears
 * once the value is dirty. Nothing is saved automatically (Escape reverts).
 */
function KeyRow({
  keyName,
  current,
  fallback,
  example,
  saving,
  canEdit,
  onSave,
}: {
  keyName: string;
  current: unknown;
  fallback: unknown;
  example?: string;
  saving: boolean;
  canEdit: boolean;
  onSave: (key: string, value: unknown) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(() => stringifyValue(current));
  const [dialogOpen, setDialogOpen] = useState(false);
  const focusedRef = useRef(false);

  /*
   * Only sync from the stored value when it actually changes (e.g. after a save
   * + refetch). Do NOT depend on focus: blurring must keep the unsaved draft so
   * the Save button stays mounted and its click can fire.
   */
  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(stringifyValue(current));
    }
  }, [current]);

  const dirty = draft !== stringifyValue(current);

  const expandButton = (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      onClick={() => setDialogOpen(true)}
      aria-label={t('sifront.expandValue')}
      title={t('sifront.expandValue')}
    >
      <Maximize2 />
    </Button>
  );

  const dialog = (
    <ValueEditorDialog
      open={dialogOpen}
      onOpenChange={setDialogOpen}
      keyName={keyName}
      value={draft}
      example={example}
      canEdit={canEdit}
      saving={saving}
      onChange={setDraft}
      onSave={() => {
        onSave(keyName, parseValue(draft));
        setDialogOpen(false);
      }}
    />
  );

  if (!canEdit) {
    return (
      <>
        <tr className="align-top">
          <td className="border-b border-border/60 px-2 py-2 font-mono text-xs break-all">
            {keyName}
          </td>
          <td className="border-b border-border/60 px-2 py-2">
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1">
                {current === undefined ? (
                  <span className="text-xs text-muted-foreground">—</span>
                ) : (
                  <ValueCell value={current} />
                )}
              </div>
              {expandButton}
            </div>
          </td>
          <td className="border-b border-border/60 px-2 py-2 text-muted-foreground">
            {fallback === undefined ? (
              <span className="text-xs text-muted-foreground">—</span>
            ) : (
              <ValueCell value={fallback} />
            )}
          </td>
        </tr>
        {dialog}
      </>
    );
  }

  return (
    <>
      <tr className="align-top">
        <td className="border-b border-border/60 px-2 py-2 font-mono text-xs break-all">
          {keyName}
        </td>
        <td className="border-b border-border/60 px-2 py-2">
          <div className="flex items-center gap-1.5">
            <Input
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onFocus={() => {
                focusedRef.current = true;
              }}
              onBlur={() => {
                focusedRef.current = false;
              }}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  setDraft(stringifyValue(current));
                  event.currentTarget.blur();
                }
              }}
              placeholder="—"
              aria-label={keyName}
              className="h-7 font-mono text-xs"
            />
            {expandButton}
            {(dirty || saving) && (
              <Button
                type="button"
                size="icon-sm"
                variant="outline"
                disabled={saving}
                onClick={() => onSave(keyName, parseValue(draft))}
                aria-label={t('sifront.saveValue')}
                title={t('sifront.saveValue')}
              >
                {saving ? <Loader2 className="animate-spin" /> : <Save />}
              </Button>
            )}
          </div>
        </td>
        <td className="border-b border-border/60 px-2 py-2 text-muted-foreground">
          {fallback === undefined ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (
            <ValueCell value={fallback} />
          )}
        </td>
      </tr>
      {dialog}
    </>
  );
}

function MetaTable({
  meta,
  values,
  savingKey,
  canEdit,
  onSave,
}: {
  meta: Record<string, unknown> | null;
  values?: Record<string, unknown>;
  savingKey: string | null;
  canEdit: boolean;
  onSave: (key: string, value: unknown) => void;
}) {
  const requireKeys: Record<string, unknown>[] =
    meta !== null && Array.isArray(meta.require_keys)
      ? (meta.require_keys as Record<string, unknown>[])
      : [];
  const examples = themeExamples(meta);

  if (requireKeys.length === 0) {
    return <p className="text-sm text-muted-foreground">No theme keys declared.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-[34%]" />
          <col className="w-[33%]" />
          <col className="w-[33%]" />
        </colgroup>
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
            return (
              <KeyRow
                key={key}
                keyName={key}
                current={values?.[key]}
                fallback={def}
                example={examples[key]}
                saving={savingKey === key}
                canEdit={canEdit}
                onSave={onSave}
              />
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
  update,
}: {
  sf: SifrontListItem;
  canManage: boolean;
  activate: UseMutationResult<unknown, unknown, number>;
  remove: UseMutationResult<unknown, unknown, number>;
  update: UseMutationResult<unknown, unknown, { id: number; bundle: SifrontBundle }>;
}) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(sf.is_active);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pendingBundle, setPendingBundle] = useState<SifrontBundle | null>(null);
  const [confirmForce, setConfirmForce] = useState(false);
  const updateRef = useRef<HTMLInputElement | null>(null);
  const updating = update.isPending && update.variables?.id === sf.id;

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

  const existingKeys = new Set(Object.keys(values.data?.data ?? {}));

  const saveValue = useMutation({
    mutationFn: (input: { key: string; value: unknown }) =>
      existingKeys.has(input.key)
        ? kvsApi.update({ key: input.key, value: input.value })
        : kvsApi.create({ key: input.key, value: input.value }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sifront-values', sf.id] });
      toast.success(t('sifront.valueSaved', { key: variables.key }));
    },
    onError: (error, variables) => {
      toast.error(
        t('sifront.valueFailed', {
          key: variables.key,
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    },
  });

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {sf.name}
          {sf.is_active && <Badge variant="default">{t('sifront.active')}</Badge>}
          {sf.is_virtual && <Badge variant="secondary">{t('sifront.virtual')}</Badge>}
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
              {!sf.is_virtual && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateRef.current?.click()}
                    disabled={updating}
                  >
                    {updating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <>
                        <Upload className="size-4" />
                        {t('sifront.update')}
                      </>
                    )}
                  </Button>
                  <input
                    ref={updateRef}
                    type="file"
                    accept=".sifront,application/zip"
                    className="hidden"
                    onChange={async event => {
                      const file = event.target.files?.[0];
                      event.target.value = '';

                      if (file === undefined) {
                        return;
                      }

                      try {
                        const parsed = await readSifrontBundle(file);

                        if (compareVersions(parsed.version, sf.version) > 0) {
                          update.mutate({ id: sf.id, bundle: parsed });
                        } else {
                          setPendingBundle(parsed);
                          setConfirmForce(true);
                        }
                      } catch (error) {
                        toast.error(
                          t('sifront.updateFailed', {
                            detail: error instanceof Error ? error.message : String(error),
                          }),
                        );
                      }
                    }}
                  />
                </>
              )}
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
              {!sf.is_active && !sf.is_virtual && (
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
            <MetaTable
              meta={detail.data?.meta ?? null}
              values={values.data?.data}
              savingKey={saveValue.isPending ? (saveValue.variables?.key ?? null) : null}
              canEdit={canManage}
              onSave={(key, value) => saveValue.mutate({ key, value })}
            />
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
      <ConfirmDialog
        open={confirmForce}
        onOpenChange={open => {
          setConfirmForce(open);

          if (!open) {
            setPendingBundle(null);
          }
        }}
        title={t('sifront.forceUpdateConfirm', {
          name: sf.name,
          version: pendingBundle?.version ?? '',
          current: sf.version,
        })}
        confirmLabel={t('sifront.forceUpdate')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => {
          if (pendingBundle !== null) {
            update.mutate({ id: sf.id, bundle: pendingBundle });
            setPendingBundle(null);
          }
        }}
      />
    </Card>
  );
}

export function SifrontsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canManage = user?.permissions?.includes('sifronts.manage') ?? false;

  usePageTitle(t('sifront.title'));

  const list = useQuery({
    queryKey: ['sifronts'],
    queryFn: sifrontsApi.list,
  });

  const create = useMutation({
    mutationFn: async (input: { file: File }) => {
      const { name, version, meta, bundle } = await readSifrontBundle(input.file);
      return sifrontsApi.create({ name, version, meta, bundle });
    },
    onSuccess: sf => {
      queryClient.invalidateQueries({ queryKey: ['sifronts'] });
      toast.success(t('sifront.created', { name: sf.name, version: sf.version }));
    },
    onError: error => {
      toast.error(
        t('sifront.uploadFailed', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    },
  });

  const update = useMutation({
    mutationFn: async (input: { id: number; bundle: SifrontBundle }) => {
      const { name, version, meta, bundle } = input.bundle;
      return sifrontsApi.update({ id: input.id, name, version, meta, bundle });
    },
    onSuccess: sf => {
      queryClient.invalidateQueries({ queryKey: ['sifronts'] });
      queryClient.invalidateQueries({ queryKey: ['sifront', sf.id] });
      toast.success(t('sifront.updated', { name: sf.name, version: sf.version }));
    },
    onError: error => {
      toast.error(
        t('sifront.updateFailed', {
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    },
  });

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so the same file can be picked again after a failure.
    event.target.value = '';

    if (file !== undefined) {
      create.mutate({ file });
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
          accept=".sifront,application/zip"
          className="hidden"
          onChange={event => handleFile(event)}
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
          update={update}
        />
      ))}
    </div>
  );
}
