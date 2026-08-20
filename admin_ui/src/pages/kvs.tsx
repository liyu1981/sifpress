import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Loader2,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { createAjvValidator, type Content } from 'vanilla-jsoneditor';
import Ajv from 'ajv/dist/2020';
import { JsonEditor, contentToJson } from '@/components/json-editor';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTitle } from '@/hooks/use-page-title';
import { ApiError, kvsApi, type KvGrant, type KvPair } from 'ui-sdk';
import { useAuth } from 'ui-sdk';

const PER_PAGE = 20;

function formatJson(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null) {
    return 'null';
  }
  return JSON.stringify(value, null, 2);
}

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

let _ajv: Ajv | null = null;

function getAjv(): Ajv {
  if (_ajv === null) {
    _ajv = new Ajv();
  }
  return _ajv;
}

function validateJsonSchema(schema: unknown): { valid: boolean; error?: string } {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return { valid: false, error: 'Schema must be a JSON object' };
  }
  try {
    const ajv = getAjv();
    const valid = ajv.validateSchema(schema);
    if (!valid) {
      return { valid: false, error: ajv.errorsText(ajv.errors) };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: err instanceof Error ? err.message : 'Invalid schema' };
  }
}

function NewKvCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [content, setContent] = useState<Content>({ json: {} });
  const [formKey, setFormKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [schemaContent, setSchemaContent] = useState<Content>({ json: {} });
  const [schemaFormKey, setSchemaFormKey] = useState(0);

  const schemaValue = useMemo(() => {
    if (!schemaOpen) return null;
    const result = contentToJson(schemaContent);
    return result.ok ? result.value : null;
  }, [schemaOpen, schemaContent]);

  const schemaValidation = useMemo(() => {
    if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) {
      return { valid: true, error: undefined as string | undefined };
    }
    return validateJsonSchema(schemaValue);
  }, [schemaValue]);

  const validator = useMemo(() => {
    if (
      !schemaValidation.valid ||
      !schemaValue ||
      typeof schemaValue !== 'object' ||
      Array.isArray(schemaValue)
    ) {
      return undefined;
    }
    try {
      return createAjvValidator({ schema: schemaValue as Record<string, unknown> });
    } catch {
      return undefined;
    }
  }, [schemaValidation.valid, schemaValue]);

  const create = useMutation({
    mutationFn: () => {
      const parsed = contentToJson(content);
      if (!parsed.ok) {
        throw new ApiError(422, { error: t('kvs.invalidJson') });
      }
      return kvsApi.create({
        key: key.trim(),
        value: parsed.value,
        ...(schemaOpen ? { schema: schemaValue } : {}),
      });
    },
    onSuccess: () => {
      setKey('');
      setContent({ json: {} });
      setFormKey(value => value + 1);
      setSchemaOpen(false);
      setSchemaContent({ json: {} });
      setSchemaFormKey(value => value + 1);
      setError(null);
      toast.success(t('kvs.created'));
      queryClient.invalidateQueries({ queryKey: ['kvs'] });
    },
    onError: err => {
      setError(
        err instanceof ApiError ? (err.data.error ?? t('kvs.createError')) : t('kvs.createError'),
      );
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardAction>
          <KeyRound className="size-5 text-muted-foreground" />
        </CardAction>
        <CardTitle>{t('kvs.newTitle')}</CardTitle>
        <CardDescription>{t('kvs.newDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="kv-new-key">{t('kvs.keyField')}</Label>
            <Input
              id="kv-new-key"
              value={key}
              onChange={event => setKey(event.target.value)}
              placeholder={t('kvs.keyPlaceholder')}
              required
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>{t('kvs.schemaTitle')}</Label>
              {!schemaOpen && (
                <Button type="button" variant="ghost" size="xs" onClick={() => setSchemaOpen(true)}>
                  <Plus />
                  {t('kvs.schemaAdd')}
                </Button>
              )}
              {schemaOpen && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    setSchemaOpen(false);
                    setSchemaContent({ json: {} });
                    setSchemaFormKey(v => v + 1);
                  }}
                >
                  {t('kvs.schemaRemove')}
                </Button>
              )}
            </div>
            {schemaOpen && (
              <div className="space-y-1.5 rounded-xl border border-border/60 p-3">
                <p className="text-xs text-muted-foreground">{t('kvs.schemaDescription')}</p>
                <JsonEditor
                  key={schemaFormKey}
                  initialValue={{}}
                  onChange={setSchemaContent}
                  className="h-[480px]"
                  ariaLabel={t('kvs.schemaTitle')}
                />
                {schemaValidation.error && (
                  <p className="text-xs text-destructive">{schemaValidation.error}</p>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="kv-new-value">{t('kvs.valueLabel')}</Label>
            <JsonEditor
              key={formKey}
              id="kv-new-value"
              initialValue={{}}
              validator={validator}
              onChange={setContent}
              className="h-[480px]"
              ariaLabel={t('kvs.valueLabel')}
            />
            <p className="text-xs text-muted-foreground">{t('kvs.valueHint')}</p>
          </div>
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            {t('kvs.create')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function KvEditForm({ pair, onDone }: { pair: KvPair; onDone: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [key, setKey] = useState(pair.key);
  const [content, setContent] = useState<Content>({ json: pair.value });
  const [error, setError] = useState<string | null>(null);
  const [schemaOpen, setSchemaOpen] = useState(pair.schema !== null && pair.schema !== undefined);
  const [schemaContent, setSchemaContent] = useState<Content>(
    pair.schema !== null && pair.schema !== undefined ? { json: pair.schema } : { json: {} },
  );
  const [schemaFormKey, setSchemaFormKey] = useState(0);

  const schemaValue = useMemo(() => {
    if (!schemaOpen) return null;
    const result = contentToJson(schemaContent);
    return result.ok ? result.value : null;
  }, [schemaOpen, schemaContent]);

  const schemaValidation = useMemo(() => {
    if (!schemaValue || typeof schemaValue !== 'object' || Array.isArray(schemaValue)) {
      return { valid: true, error: undefined as string | undefined };
    }
    return validateJsonSchema(schemaValue);
  }, [schemaValue]);

  const validator = useMemo(() => {
    if (
      !schemaValidation.valid ||
      !schemaValue ||
      typeof schemaValue !== 'object' ||
      Array.isArray(schemaValue)
    ) {
      return undefined;
    }
    try {
      return createAjvValidator({ schema: schemaValue as Record<string, unknown> });
    } catch {
      return undefined;
    }
  }, [schemaValidation.valid, schemaValue]);

  const save = useMutation({
    mutationFn: () => {
      const parsed = contentToJson(content);
      if (!parsed.ok) {
        throw new ApiError(422, { error: t('kvs.invalidJson') });
      }
      return kvsApi.update({
        key: pair.key,
        ...(key.trim() !== pair.key ? { new_key: key.trim() } : {}),
        value: parsed.value,
        schema: schemaOpen ? schemaValue : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kvs'] });
      onDone();
    },
    onError: err => {
      setError(
        err instanceof ApiError ? (err.data.error ?? t('kvs.saveError')) : t('kvs.saveError'),
      );
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`kv-edit-key-${pair.id}`}>{t('kvs.keyField')}</Label>
        <Input
          id={`kv-edit-key-${pair.id}`}
          value={key}
          onChange={event => setKey(event.target.value)}
          required
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label>{t('kvs.schemaTitle')}</Label>
          {!schemaOpen && (
            <Button type="button" variant="ghost" size="xs" onClick={() => setSchemaOpen(true)}>
              <Plus />
              {t('kvs.schemaAdd')}
            </Button>
          )}
          {schemaOpen && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => {
                setSchemaOpen(false);
                setSchemaContent({ json: {} });
                setSchemaFormKey(v => v + 1);
              }}
            >
              {t('kvs.schemaRemove')}
            </Button>
          )}
        </div>
        {schemaOpen && (
          <div className="space-y-1.5 rounded-xl border border-border/60 p-3">
            <p className="text-xs text-muted-foreground">{t('kvs.schemaDescription')}</p>
            <JsonEditor
              key={schemaFormKey}
              initialValue={pair.schema ?? {}}
              onChange={setSchemaContent}
              className="h-[480px]"
              ariaLabel={t('kvs.schemaTitle')}
            />
            {schemaValidation.error && (
              <p className="text-xs text-destructive">{schemaValidation.error}</p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`kv-edit-value-${pair.id}`}>{t('kvs.valueLabel')}</Label>
        <JsonEditor
          id={`kv-edit-value-${pair.id}`}
          initialValue={pair.value}
          validator={validator}
          onChange={setContent}
          className="h-[480px]"
          ariaLabel={t('kvs.valueLabel')}
        />
      </div>
      {error !== null && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
          {t('kvs.save')}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={save.isPending}>
          {t('kvs.cancel')}
        </Button>
      </div>
    </form>
  );
}

function KvGrantRow({
  grant,
  onRevoke,
  saving,
}: {
  grant: KvGrant;
  onRevoke: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const isGuest = grant.username === '_guest_';
  const label =
    grant.username === '_guest_'
      ? grant.name || t('kvs.websiteGuest')
      : grant.username === 'admin'
        ? t('kvs.websiteAdmin')
        : grant.username;
  const note =
    grant.note ?? (grant.granted_by_name ? t('kvs.grantBy', { name: grant.granted_by_name }) : '');

  return (
    <tr className="border-b border-black/25 last:border-b-0 dark:border-border">
      <td className="px-3 py-2">
        <span className="truncate font-medium">{label}</span>
      </td>
      <td className="px-3 py-2">
        <Badge variant={grant.permission === 'edit' ? 'default' : 'outline'}>
          {grant.permission === 'edit' ? t('kvs.permissionEdit') : t('kvs.permissionView')}
        </Badge>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {grant.kind === 'owner' && <Badge variant="secondary">{t('kvs.grantRoleOwner')}</Badge>}
          {grant.kind === 'admin' && <Badge variant="secondary">{t('kvs.grantRoleAdmin')}</Badge>}
          {note !== '' && <span className="text-xs text-muted-foreground">{note}</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={onRevoke}
            disabled={saving || grant.kind !== 'grant'}
          >
            {t('kvs.grantRevoke')}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function KvAccessPanel({ pair }: { pair: KvPair }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [permission, setPermission] = useState<'edit' | 'view'>('view');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const grantsQuery = useQuery({
    queryKey: ['kvs-grants', pair.key],
    queryFn: () => kvsApi.grants(pair.key),
  });

  const grant = useMutation({
    mutationFn: (args: { username: string; permission: 'edit' | 'view'; note?: string | null }) =>
      kvsApi.grant({ key: pair.key, ...args }),
    onSuccess: () => {
      setError(null);
      setUsername('');
      setPermission('view');
      setNote('');
      queryClient.invalidateQueries({ queryKey: ['kvs-grants', pair.key] });
      queryClient.invalidateQueries({ queryKey: ['kvs'] });
    },
    onError: err => {
      setError(
        err instanceof ApiError ? (err.data.error ?? t('kvs.saveError')) : t('kvs.saveError'),
      );
    },
  });

  const revoke = useMutation({
    mutationFn: (username: string) => kvsApi.revokeGrant({ key: pair.key, username }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kvs-grants', pair.key] });
      queryClient.invalidateQueries({ queryKey: ['kvs'] });
    },
    onError: err => {
      setError(
        err instanceof ApiError ? (err.data.error ?? t('kvs.saveError')) : t('kvs.saveError'),
      );
    },
  });

  function handleAddGrant() {
    grant.mutate({
      username: username.trim(),
      permission,
      note: note.trim() === '' ? null : note.trim(),
    });
  }

  const rows = grantsQuery.data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('kvs.accessDescription')}</p>

      <div className="overflow-x-auto rounded-xl border-2 border-black/25 dark:border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b-2 border-black/25 text-left text-xs text-muted-foreground dark:border-border">
              <th className="px-3 py-2 font-medium">{t('kvs.grantUsername')}</th>
              <th className="px-3 py-2 font-medium">{t('kvs.grantPermissionField')}</th>
              <th className="px-3 py-2 font-medium">{t('kvs.grantNote')}</th>
              <th className="px-3 py-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black/25 dark:border-border">
              <td className="px-3 py-2">
                <Input
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  placeholder={t('kvs.grantPlaceholder')}
                  className="h-8"
                />
              </td>
              <td className="px-3 py-2">
                <Select
                  value={permission}
                  onValueChange={value => setPermission(value as 'edit' | 'view')}
                >
                  <SelectTrigger
                    className="h-8 w-full min-w-[6.5rem]"
                    aria-label={t('kvs.grantPermissionField')}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="edit">{t('kvs.permissionEdit')}</SelectItem>
                    <SelectItem value="view">{t('kvs.permissionView')}</SelectItem>
                  </SelectContent>
                </Select>
              </td>
              <td className="px-3 py-2">
                <Input
                  value={note}
                  onChange={event => setNote(event.target.value)}
                  placeholder={t('kvs.grantNotePlaceholder')}
                  className="h-8"
                />
              </td>
              <td className="px-3 py-2">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleAddGrant}
                    disabled={grant.isPending || username.trim() === ''}
                  >
                    <UserPlus />
                    {t('kvs.grantAdd')}
                  </Button>
                </div>
              </td>
            </tr>

            {rows.map(row => (
              <KvGrantRow
                key={row.username}
                grant={row}
                onRevoke={() => revoke.mutate(row.username)}
                saving={grant.isPending || revoke.isPending}
              />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="py-2 text-sm text-muted-foreground">
                  {t('kvs.grantsEmpty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function KvCard({ pair, canManage }: { pair: KvPair; canManage: boolean }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const valueText = formatJson(pair.value);
  const lines = valueText.split('\n');
  const preview = lines.length <= 20 ? valueText : `${lines.slice(0, 20).join('\n')}\n…`;

  const setPublic = useMutation({
    mutationFn: (value: boolean) =>
      value
        ? kvsApi.grant({ key: pair.key, username: '_guest_', permission: 'view', note: null })
        : kvsApi.revokeGrant({ key: pair.key, username: '_guest_' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kvs'] });
    },
    onError: err => {
      toast.error(
        err instanceof ApiError ? (err.data.error ?? t('kvs.saveError')) : t('kvs.saveError'),
      );
    },
  });

  const remove = useMutation({
    mutationFn: () => kvsApi.remove(pair.key),
    onSuccess: () => {
      toast.success(t('kvs.deleted'));
      queryClient.invalidateQueries({ queryKey: ['kvs'] });
    },
    onError: err => {
      toast.error(
        err instanceof ApiError ? (err.data.error ?? t('kvs.deleteError')) : t('kvs.deleteError'),
      );
    },
  });

  return (
    <div className="glass-control flex flex-col rounded-xl">
      {/* Row 1: Key pill + key value ——————— published switch */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-4">
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <Badge variant="secondary">{t('kvs.keyField')}</Badge>
          <code className="break-all font-mono text-sm font-medium">{pair.key}</code>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {canManage && (
            <>
              <Switch
                checked={pair.public}
                disabled={setPublic.isPending}
                onCheckedChange={value => setPublic.mutate(value)}
                aria-label={pair.public ? t('kvs.public') : t('kvs.private')}
              />
              <span className="text-xs text-muted-foreground">
                {pair.public ? t('kvs.published') : t('kvs.private')}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Updated info */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 text-xs text-muted-foreground">
        <span>
          {t('kvs.updatedAt')} {formatDate(pair.updated_at, i18n.language)}
          {' · '}
          {t('kvs.by', { name: pair.updated_by_name || '—' })}
        </span>
      </div>

      {/* Row 2: Value label + brief preview — collapsed only */}
      {!expanded && (
        <div className="border-t border-border/60 px-4 pb-3 pt-2">
          <div className="mb-1">
            <Badge variant="secondary">{t('kvs.valueSection')}</Badge>
          </div>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-xs leading-5">
            {preview}
          </pre>
        </div>
      )}

      {/* Action buttons — collapsed only */}
      {!expanded && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-4 py-2">
          {pair.can_edit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setExpanded(true);
                setEditing(true);
                setAccessOpen(false);
              }}
            >
              <Save />
              {t('kvs.edit')}
            </Button>
          )}
          {canManage && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setExpanded(true);
                setAccessOpen(true);
                setEditing(false);
              }}
            >
              <ShieldCheck />
              {t('kvs.access')}
            </Button>
          )}
          {canManage && (
            <DropdownMenu open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="sm" className="text-destructive">
                  <Trash2 />
                  {t('kvs.delete')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                <p className="px-1 text-sm font-medium">
                  {t('kvs.deleteConfirm', { key: pair.key })}
                </p>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteOpen(false)}
                    disabled={remove.isPending}
                  >
                    {t('kvs.cancel')}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    onClick={() => remove.mutate()}
                    disabled={remove.isPending}
                  >
                    {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    {t('kvs.delete')}
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      {/* Expanded — edit form */}
      {expanded && editing && pair.can_edit && (
        <div className="border-t border-border/60 p-4">
          <KvEditForm
            pair={pair}
            onDone={() => {
              setEditing(false);
              setExpanded(false);
            }}
          />
        </div>
      )}

      {/* Expanded — access control with Done button */}
      {expanded && accessOpen && canManage && (
        <div className="border-t border-border/60 p-4">
          <KvAccessPanel pair={pair} />
          <div className="mt-3 flex justify-end">
            <Button type="button" size="sm" onClick={() => setExpanded(false)}>
              {t('kvs.done')}
            </Button>
          </div>
        </div>
      )}

      {/* Expanded — full value view (key click, no edit/access) */}
      {expanded && !editing && !accessOpen && (
        <div className="space-y-3 border-t border-border/60 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">{t('kvs.valueSection')}</p>
            {lines.length > 20 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => setShowFull(value => !value)}
              >
                {showFull ? t('kvs.showLess') : t('kvs.showMore')}
              </Button>
            )}
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-xs leading-5">
            {showFull ? valueText : preview}
          </pre>
        </div>
      )}
    </div>
  );
}

export function KvsPage() {
  const { t } = useTranslation();
  const { user, isAdmin, has } = useAuth();

  usePageTitle(t('kvs.title'));

  const canWrite = isAdmin || has('kvs.write');

  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);

  const listQuery = useQuery({
    queryKey: ['kvs', { q: submitted, page }],
    queryFn: () =>
      kvsApi.list({
        ...(submitted !== '' ? { q: submitted } : {}),
        page,
        per_page: PER_PAGE,
      }),
  });

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">{t('kvs.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('kvs.description')}</p>
        </div>
        <Badge variant="outline">{t('kvs.total', { count: total })}</Badge>
      </header>

      <Tabs defaultValue="browse" className="gap-6 md:flex-row">
        <TabsList className="w-fit flex-row gap-1 bg-transparent p-0 dark:bg-transparent md:h-auto md:w-44 md:flex-col md:items-stretch md:self-start">
          <TabsTrigger
            value="browse"
            className="group justify-end rounded-full border-transparent px-0 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none"
          >
            <span className="rounded-full px-3 py-1.5 transition-colors group-data-[state=active]:bg-accent group-data-[state=active]:text-accent-foreground">
              {t('kvs.tabBrowse')}
            </span>
          </TabsTrigger>
          {canWrite && (
            <TabsTrigger
              value="create"
              className="group justify-end rounded-full border-transparent px-0 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none"
            >
              <span className="rounded-full px-3 py-1.5 transition-colors group-data-[state=active]:bg-accent group-data-[state=active]:text-accent-foreground">
                {t('kvs.tabCreate')}
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="browse" className="min-w-0 space-y-6">
          <form
            className="relative min-w-0 flex-1"
            onSubmit={event => {
              event.preventDefault();
              setSubmitted(query.trim());
              setPage(1);
            }}
          >
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('kvs.search')}
              className="pl-8"
            />
          </form>

          {listQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                {submitted !== '' ? t('kvs.searchEmpty', { q: submitted }) : t('kvs.empty')}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {items.map(pair => (
                  <KvCard
                    key={pair.key}
                    pair={pair}
                    canManage={user !== null && (isAdmin || pair.created_by === user.id)}
                  />
                ))}
              </div>

              {pages > 1 && (
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(value => value - 1)}
                  >
                    {t('kvs.prev')}
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    {t('kvs.page', { page, pages })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page >= pages}
                    onClick={() => setPage(value => value + 1)}
                  >
                    {t('kvs.next')}
                  </Button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        {canWrite && (
          <TabsContent value="create" className="min-w-0 space-y-6">
            <NewKvCard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
