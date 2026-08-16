import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Bot,
  ChevronDown,
  Loader2,
  Lock,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DeletePageMenu } from '@/components/delete-page-menu';
import { TagsInput } from '@/components/tags-input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { usePageTitle } from '@/hooks/use-page-title';
import { ApiError, assetSourceUrl } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buildFrontMatter, parseFrontMatter, STANDARD_FRONT_MATTER_KEYS } from '@/lib/front-matter';
import { MilkdownEditor, type MilkdownEditorHandle } from '@/lib/marked';
import { escapeTableCodePipes } from '@/lib/marked/preprocess';
import { assetsApi, type Grant, pagesApi } from '@/lib/pages';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayString(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

interface SavePayload {
  slug: string;
  title: string;
  status: 'published' | 'draft';
  content_md: string;
  created_at: string;
  updated_at: string;
}

interface ExtraField {
  id: number;
  key: string;
  value: string;
}

function scalarToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(scalarToString).join(', ');
  }
  return '';
}

function errorMessages(error: ApiError | null): string[] {
  if (error === null) {
    return [];
  }

  const messages = Object.values(error.data.errors ?? {}).flat();

  return messages.length > 0 ? messages : error.data.error ? [error.data.error] : [];
}

function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-full bg-muted/60 p-1">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            value === option.value
              ? 'bg-accent text-accent-foreground'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * One row of the access table: username, a changeable edit/view
 * selector (granted rows only), the note, and the action cell (Save
 * once the permission changes, Revoke for removable grants).
 */
function GrantRow({
  grant,
  index,
  onSave,
  onRevoke,
  saving,
}: {
  grant: Grant;
  index: number;
  onSave: (permission: 'edit' | 'view') => void;
  onRevoke: () => void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const [permission, setPermission] = useState<'edit' | 'view'>(grant.permission);

  useEffect(() => {
    setPermission(grant.permission);
  }, [grant.permission]);

  const isFixed = grant.kind !== 'grant';
  const isGuest = grant.username === '_guest_';
  const changed = !isFixed && permission !== grant.permission;
  const label =
    grant.username === '_guest_'
      ? grant.name || t('editor.websiteGuest')
      : grant.username === 'admin'
        ? t('editor.websiteAdmin')
        : grant.username;
  const note =
    grant.note ??
    (grant.granted_by_name ? t('editor.grantBy', { name: grant.granted_by_name }) : '');

  return (
    <tr
      className={`border-b border-black/25 last:border-b-0 dark:border-border ${
        index % 2 === 1 ? 'bg-muted/40' : ''
      }`}
    >
      <td className="px-3 py-2">
        <span className="truncate font-medium">{label}</span>
      </td>
      <td className="px-3 py-2">
        <Select
          value={isFixed ? 'edit' : permission}
          onValueChange={value => setPermission(value as 'edit' | 'view')}
          disabled={isFixed}
        >
          <SelectTrigger
            size="sm"
            className="h-7 w-full min-w-[6.5rem] text-xs"
            aria-label={t('editor.grantPermissionField')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="edit">{t('editor.permissionEdit')}</SelectItem>
            <SelectItem value="view">{t('editor.permissionView')}</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {grant.kind === 'owner' && (
            <Badge variant="secondary">{t('editor.grantRoleOwner')}</Badge>
          )}
          {grant.kind === 'admin' && (
            <Badge variant="secondary">{t('editor.grantRoleAdmin')}</Badge>
          )}
          {note !== '' && <span className="text-xs text-muted-foreground">{note}</span>}
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1.5">
          {changed && (
            <Button type="button" size="xs" onClick={() => onSave(permission)} disabled={saving}>
              {t('editor.save')}
            </Button>
          )}
          {!isFixed && !isGuest && (
            <Button type="button" variant="ghost" size="xs" onClick={onRevoke} disabled={saving}>
              {t('editor.grantRevoke')}
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function EditorSkeleton() {
  return (
    <div className="glass-control animate-pulse rounded-2xl">
      <div className="space-y-4 p-8">
        <div className="h-3 w-1/4 rounded bg-muted" />
        <div className="h-8 w-2/3 rounded bg-muted" />
        <div className="h-40 w-full rounded bg-muted" />
      </div>
    </div>
  );
}

export function EditorPage({ slug }: { slug: string | null }) {
  const { t } = useTranslation();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const editing = slug !== null;
  usePageTitle(editing ? t('editor.editTitle') : t('editor.newTitle'));

  const pageQuery = useQuery({
    queryKey: ['page', slug ?? 'new'],
    queryFn: () => (slug ? pagesApi.get({ slug }) : Promise.resolve(null)),
    enabled: editing,
  });

  const [title, setTitle] = useState('');
  const [slugValue, setSlugValue] = useState('');
  const [date, setDate] = useState(editing ? '' : todayString());
  const [updatedDate, setUpdatedDate] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [extraFields, setExtraFields] = useState<ExtraField[]>([]);
  const [extraOpen, setExtraOpen] = useState(false);
  const [published, setPublished] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveError, setSaveError] = useState<ApiError | null>(null);
  const editorRef = useRef<MilkdownEditorHandle>(null);
  const extraFieldIdRef = useRef(0);

  const [body, setBody] = useState('');
  const [bodyTab, setBodyTab] = useState<'editor' | 'source'>('editor');
  const [sourceBody, setSourceBody] = useState('');
  const [sourceDirty, setSourceDirty] = useState(false);

  const [frontTab, setFrontTab] = useState<'fields' | 'raw'>('fields');
  const [rawFront, setRawFront] = useState('');
  const [rawDirty, setRawDirty] = useState(false);
  const [rawError, setRawError] = useState<string | null>(null);

  const [accessOpen, setAccessOpen] = useState(false);
  const [grantUsername, setGrantUsername] = useState('');
  const [grantPermission, setGrantPermission] = useState<'edit' | 'view'>('edit');
  const [grantNote, setGrantNote] = useState('');
  const [grantError, setGrantError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (!editing || loaded || pageQuery.data === undefined) {
      return;
    }

    const page = pageQuery.data;

    if (page !== null) {
      const meta = parseFrontMatter(page.content_md);
      const data = meta.data;

      setTitle(typeof data.title === 'string' ? data.title : '');
      setSlugValue(typeof data.slug === 'string' ? data.slug : '');
      setDate(typeof data.date === 'string' ? data.date : '');
      setTags(
        Array.isArray(data.tags)
          ? data.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
      );

      const extras: ExtraField[] = Object.entries(data)
        .filter(([key]) => !STANDARD_FRONT_MATTER_KEYS.has(key))
        .map(([key, value]) => {
          extraFieldIdRef.current += 1;
          return { id: extraFieldIdRef.current, key, value: scalarToString(value) };
        });
      setExtraFields(extras);
      setExtraOpen(extras.length > 0);

      setBody(escapeTableCodePipes(meta.content));
      setSourceBody(escapeTableCodePipes(meta.content));
      setPublished(page.status === 'published');
    }

    setLoaded(true);
  }, [editing, loaded, pageQuery.data]);

  const handleUpload = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    const result = await assetsApi.create(formData);
    return assetSourceUrl(result.asset.id, result.asset.name, result.asset.kind);
  }, []);

  const save = useMutation({
    mutationFn: async (meta: SavePayload) => {
      const base = {
        slug: meta.slug,
        title: meta.title,
        status: meta.status,
        content_md: meta.content_md,
        created_at: meta.created_at,
        updated_at: meta.updated_at,
      };

      return editing ? pagesApi.update({ id: pageQuery.data!.id, ...base }) : pagesApi.create(base);
    },
    onSuccess: page => {
      queryClient.invalidateQueries({ queryKey: ['pages'] });
      queryClient.invalidateQueries({ queryKey: ['page', page.slug] });
      navigate({ to: '/article/$slug', params: { slug: page.slug } });
    },
    onError: err => {
      setSaveError(err instanceof ApiError ? err : null);
    },
  });

  const buildFrontMatterFromFields = (): string =>
    buildFrontMatter({
      title: title.trim(),
      slug: slugValue.trim(),
      date: date.trim(),
      tags,
      extra: extraFields
        .map(field => ({ key: field.key.trim(), value: field.value }))
        .filter(field => field.key !== ''),
    });

  const applyRawFront = (raw: string): boolean => {
    const meta = parseFrontMatter(`${raw.trimEnd()}\n\n`);
    const data = meta.data;

    if (Object.keys(data).length === 0) {
      setRawError(t('editor.rawInvalid'));
      return false;
    }

    setTitle(typeof data.title === 'string' ? data.title : '');
    setSlugValue(typeof data.slug === 'string' ? data.slug : '');
    setDate(typeof data.date === 'string' ? data.date : '');
    setTags(
      Array.isArray(data.tags)
        ? data.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
    );

    const extras: ExtraField[] = Object.entries(data)
      .filter(([key]) => !STANDARD_FRONT_MATTER_KEYS.has(key))
      .map(([key, value]) => {
        extraFieldIdRef.current += 1;
        return { id: extraFieldIdRef.current, key, value: scalarToString(value) };
      });
    setExtraFields(extras);
    setExtraOpen(extras.length > 0);

    setRawError(null);
    return true;
  };

  const switchFrontTab = (next: 'fields' | 'raw'): void => {
    if (next === frontTab) {
      return;
    }

    if (next === 'raw') {
      setRawFront(buildFrontMatterFromFields());
      setRawDirty(false);
      setRawError(null);
    } else if (rawDirty && !applyRawFront(rawFront)) {
      return;
    }

    setFrontTab(next);
  };

  const switchBodyTab = (next: 'editor' | 'source'): void => {
    if (next === bodyTab) {
      return;
    }

    if (next === 'source') {
      setSourceBody(editorRef.current?.getMarkdown() ?? '');
      setSourceDirty(false);
    } else if (sourceDirty) {
      editorRef.current?.setMarkdown(sourceBody);
      setSourceDirty(false);
    }

    setBodyTab(next);
  };

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);

    const errors: Record<string, string> = {};
    const cleanTitle = title.trim();
    const cleanSlug = slugValue.trim().toLowerCase();
    const cleanDate = date.trim();
    const cleanUpdatedDate = updatedDate.trim();

    if (cleanTitle === '') {
      errors.title = t('editor.metaTitleRequired');
    }

    if (cleanSlug === '') {
      errors.slug = t('editor.metaSlugRequired');
    } else if (!SLUG_RE.test(cleanSlug)) {
      errors.slug = t('editor.slugInvalid');
    }

    if (cleanDate !== '' && !DATE_RE.test(cleanDate)) {
      errors.date = t('editor.metaDateInvalid');
    }

    if (cleanUpdatedDate !== '' && !DATE_RE.test(cleanUpdatedDate)) {
      errors.updated_at = t('editor.metaDateInvalid');
    }

    if (Object.keys(errors).length > 0) {
      const fieldErrors = Object.fromEntries(
        Object.entries(errors).map(([field, message]) => [field, [message]]),
      );
      setSaveError(new ApiError(422, { error: t('editor.metaInvalid'), errors: fieldErrors }));
      return;
    }

    let frontBlock: string;

    if (frontTab === 'raw' && rawDirty) {
      const meta = parseFrontMatter(`${rawFront.trimEnd()}\n\n`);
      if (Object.keys(meta.data).length === 0) {
        setSaveError(new ApiError(422, { error: t('editor.rawInvalid'), errors: {} }));
        return;
      }
      frontBlock = `${rawFront.trimEnd()}\n\n`;
    } else {
      frontBlock = buildFrontMatterFromFields();
    }

    const bodyMd = bodyTab === 'source' ? sourceBody : (editorRef.current?.getMarkdown() ?? '');

    save.mutate({
      slug: cleanSlug,
      title: cleanTitle,
      status: published ? 'published' : 'draft',
      content_md: frontBlock + bodyMd,
      created_at: cleanDate !== '' ? `${cleanDate} 00:00:00` : '',
      updated_at: cleanUpdatedDate !== '' ? `${cleanUpdatedDate} 00:00:00` : '',
    });
  }

  const addExtraField = (): void => {
    extraFieldIdRef.current += 1;
    setExtraFields(prev => [...prev, { id: extraFieldIdRef.current, key: '', value: '' }]);
    setExtraOpen(true);
  };

  const updateExtraField = (id: number, patch: Partial<ExtraField>): void => {
    setExtraFields(prev => prev.map(field => (field.id === id ? { ...field, ...patch } : field)));
  };

  const removeExtraField = (id: number): void => {
    setExtraFields(prev => prev.filter(field => field.id !== id));
  };

  const page = pageQuery.data ?? null;
  const canManageGrants = page !== null && (isAdmin || page.created_by === user?.id);

  const grantsQuery = useQuery({
    queryKey: ['page-grants', page?.id],
    queryFn: () => pagesApi.grants(page!.id),
    enabled: editing && page !== null && canManageGrants,
  });

  const grant = useMutation({
    mutationFn: (args: { username: string; permission: 'edit' | 'view'; note?: string }) =>
      pagesApi.grant(page!.id, args.username, args.permission, args.note),
    onSuccess: () => {
      setGrantError(null);
      queryClient.invalidateQueries({ queryKey: ['page-grants', page?.id] });
    },
    onError: err => {
      setGrantError(err instanceof ApiError ? err : null);
    },
  });

  function handleAddGrant() {
    grant.mutate({
      username: grantUsername.trim(),
      permission: grantPermission,
      note: grantNote,
    });
    setGrantUsername('');
    setGrantPermission('edit');
    setGrantNote('');
  }

  const revoke = useMutation({
    mutationFn: (username: string) => pagesApi.revokeGrant(page!.id, username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-grants', page?.id] });
    },
  });

  if (editing && pageQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EditorSkeleton />
      </div>
    );
  }

  if (editing && pageQuery.data === null) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4 text-center">
        <Badge variant="outline">{t('editor.notFoundBadge')}</Badge>
        <h1 className="font-heading text-2xl font-bold">{t('editor.notFoundTitle')}</h1>
        <Button asChild variant="glass" size="sm">
          <Link to="/article">
            <ArrowLeft className="size-3.5" />
            {t('article.backToIndex')}
          </Link>
        </Button>
      </div>
    );
  }

  if (editing && page !== null && !page.can_edit) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold">{t('editor.forbiddenTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('editor.forbiddenDescription')}</p>
        <Button asChild variant="glass" size="sm">
          <Link to="/article/$slug" params={{ slug: page.slug }}>
            <ArrowLeft className="size-3.5" />
            {t('article.backToIndex')}
          </Link>
        </Button>
      </div>
    );
  }

  const messages = errorMessages(saveError);

  return (
    <div className="w-full">
      <form onSubmit={handleSave} className="w-full space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {editing ? t('editor.editTitle') : t('editor.newTitle')}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2">
              <Switch
                checked={published}
                onCheckedChange={setPublished}
                aria-label={t('editor.statusField')}
              />
              <span className="text-sm font-medium">
                {published ? t('editor.statusPublished') : t('editor.statusDraft')}
              </span>
            </label>
            {editing &&
              page !== null &&
              user !== null &&
              (isAdmin || page.created_by === user.id) && (
                <DeletePageMenu
                  pageId={page.id}
                  title={page.title}
                  onDeleted={() => navigate({ to: '/article' })}
                >
                  <Button type="button" variant="destructive" size="sm">
                    <Trash2 />
                    {t('editor.delete')}
                  </Button>
                </DeletePageMenu>
              )}
            {editing && page !== null && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/agent" search={{ draft: page.slug }}>
                  <Bot />
                  {t('agent.askAgent')}
                </Link>
              </Button>
            )}
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('editor.save')}
            </Button>
          </div>
        </div>

        {!editing && <p className="text-sm text-muted-foreground">{t('editor.newHint')}</p>}

        {editing && page !== null && canManageGrants && (
          <div className="glass-control rounded-2xl">
            <button
              type="button"
              onClick={() => setAccessOpen(value => !value)}
              className="flex w-full items-center justify-between gap-3 p-4 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck className="size-4 text-muted-foreground" />
                {t('editor.grantsTitle')}
              </span>
              <ChevronDown
                className={`size-4 text-muted-foreground transition-transform ${
                  accessOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {accessOpen && (
              <div className="space-y-3 border-t border-border/60 p-4">
                <p className="text-xs text-muted-foreground">{t('editor.grantsDescription')}</p>

                <div className="overflow-x-auto rounded-xl border-2 border-black/25 dark:border-border">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b-2 border-black/25 text-left text-xs text-muted-foreground dark:border-border">
                        <th className="px-3 py-2 font-medium">{t('editor.grantUsername')}</th>
                        <th className="px-3 py-2 font-medium">
                          {t('editor.grantPermissionField')}
                        </th>
                        <th className="px-3 py-2 font-medium">{t('editor.grantNote')}</th>
                        <th className="px-3 py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-black/25 dark:border-border">
                        <td className="px-3 py-2">
                          <Input
                            value={grantUsername}
                            onChange={event => setGrantUsername(event.target.value)}
                            placeholder={t('editor.grantPlaceholder')}
                            className="h-8"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={grantPermission}
                            onValueChange={value => setGrantPermission(value as 'edit' | 'view')}
                          >
                            <SelectTrigger
                              className="h-8 w-full min-w-[6.5rem]"
                              aria-label={t('editor.grantPermissionField')}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="edit">{t('editor.permissionEdit')}</SelectItem>
                              <SelectItem value="view">{t('editor.permissionView')}</SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            value={grantNote}
                            onChange={event => setGrantNote(event.target.value)}
                            placeholder={t('editor.grantNotePlaceholder')}
                            className="h-8"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end">
                            <Button
                              type="button"
                              size="sm"
                              onClick={handleAddGrant}
                              disabled={grant.isPending || grantUsername.trim() === ''}
                            >
                              <UserPlus />
                              {t('editor.grantAdd')}
                            </Button>
                          </div>
                        </td>
                      </tr>

                      {grantsQuery.data?.map((g, index) => (
                        <GrantRow
                          key={g.username}
                          grant={g}
                          index={index}
                          onSave={permission =>
                            grant.mutate({
                              username: g.username,
                              permission,
                            })
                          }
                          onRevoke={() => revoke.mutate(g.username)}
                          saving={grant.isPending || revoke.isPending}
                        />
                      ))}
                      {grantsQuery.data?.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-2 text-sm text-muted-foreground">
                            {t('editor.grantsEmpty')}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {grantError !== null && (
                  <p className="text-sm text-destructive">
                    {grantError.data.error ?? t('editor.grantError')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {messages.length > 0 && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {messages.map(message => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}

        <div className="glass-control overflow-hidden rounded-2xl shadow-[0_10px_24px_-8px_rgba(0,0,0,0.28)] dark:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.6)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
            <span className="text-sm font-medium">{t('editor.frontmatterTitle')}</span>
            <SegmentedControl
              value={frontTab}
              onChange={switchFrontTab}
              options={[
                { value: 'fields', label: t('editor.fieldsTab') },
                { value: 'raw', label: t('editor.rawTab') },
              ]}
            />
          </div>

          {frontTab === 'fields' ? (
            <div className="p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('editor.titleField')}
                  </span>
                  <Input
                    value={title}
                    onChange={event => setTitle(event.target.value)}
                    placeholder={t('editor.titleField')}
                    className="h-9"
                  />
                </label>
                <label className="flex w-full flex-col gap-1.5 sm:w-56">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('editor.slugField')}
                  </span>
                  <Input
                    value={slugValue}
                    onChange={event => setSlugValue(event.target.value)}
                    placeholder="my-post-slug"
                    className="h-9"
                  />
                </label>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('editor.updatedAtField')}
                  </span>
                  <Input
                    value={updatedDate}
                    onChange={event => setUpdatedDate(event.target.value)}
                    placeholder={t('editor.updatedAtHint')}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('editor.createdAtField')}
                  </span>
                  <Input
                    value={date}
                    onChange={event => setDate(event.target.value)}
                    placeholder="YYYY-MM-DD"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t('editor.tagsField')}
                  </span>
                  <TagsInput
                    value={tags}
                    onChange={setTags}
                    placeholder={t('editor.tagsPlaceholder')}
                  />
                  {tags.length === 0 && (
                    <span className="text-[0.65rem] leading-none text-muted-foreground">
                      {t('editor.tagsHint')}
                    </span>
                  )}
                </label>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
                <button
                  type="button"
                  onClick={() => setExtraOpen(value => !value)}
                  className="flex items-center gap-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  aria-expanded={extraOpen}
                >
                  <ChevronDown
                    className={`size-3.5 transition-transform ${extraOpen ? 'rotate-180' : ''}`}
                  />
                  {t('editor.extraFieldsTitle')}
                </button>
                <Button type="button" variant="outline" size="xs" onClick={addExtraField}>
                  <Plus />
                  {t('editor.addField')}
                </Button>
              </div>

              {extraOpen && (
                <div className="mt-3 space-y-2">
                  {extraFields.length === 0 && (
                    <p className="text-xs text-muted-foreground">{t('editor.extraFieldsEmpty')}</p>
                  )}
                  {extraFields.map(field => (
                    <div key={field.id} className="flex items-center gap-2">
                      <Input
                        value={field.key}
                        onChange={event => updateExtraField(field.id, { key: event.target.value })}
                        placeholder={t('editor.fieldKeyPlaceholder')}
                        className="h-8 w-32"
                      />
                      <Input
                        value={field.value}
                        onChange={event =>
                          updateExtraField(field.id, { value: event.target.value })
                        }
                        placeholder={t('editor.fieldValuePlaceholder')}
                        className="h-8 flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => removeExtraField(field.id)}
                        aria-label={t('editor.removeField')}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="p-4">
              <textarea
                aria-label={t('editor.rawTab')}
                value={rawFront}
                onChange={event => {
                  setRawFront(event.target.value);
                  setRawDirty(true);
                }}
                className="h-64 w-full resize-y rounded-xl border border-input bg-background p-3 font-mono text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                spellCheck={false}
              />
              {rawError !== null && <p className="mt-2 text-sm text-destructive">{rawError}</p>}
              <p className="mt-2 text-xs text-muted-foreground">{t('editor.rawHint')}</p>
            </div>
          )}
        </div>

        <div className="glass-control overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-2">
            <span className="text-sm font-medium">{t('editor.bodyTitle')}</span>
            <SegmentedControl
              value={bodyTab}
              onChange={switchBodyTab}
              options={[
                { value: 'editor', label: t('editor.editorTab') },
                { value: 'source', label: t('editor.sourceTab') },
              ]}
            />
          </div>

          <div className={bodyTab === 'editor' ? 'block' : 'hidden'}>
            {(!editing || loaded) && (
              <MilkdownEditor ref={editorRef} defaultValue={body} onUpload={handleUpload} />
            )}
          </div>

          {bodyTab === 'source' && (
            <textarea
              aria-label={t('editor.sourceTab')}
              value={sourceBody}
              onChange={event => {
                setSourceBody(event.target.value);
                setSourceDirty(true);
              }}
              className="min-h-[60vh] w-full resize-y bg-transparent p-4 font-mono text-sm leading-6 outline-none"
              spellCheck={false}
            />
          )}
        </div>
      </form>
    </div>
  );
}
