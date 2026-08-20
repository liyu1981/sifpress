import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownToLine,
  BarChart3,
  ChevronDown,
  ExternalLink,
  Globe,
  Image,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  Upload,
  UserPlus,
  UserRound,
} from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { AgentSettingsCard } from '@/components/agent/agent-settings';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTitle } from '@/hooks/use-page-title';
import { ApiError } from 'ui-sdk';
import { makeAvatarThumb } from 'ui-sdk';
import { useAuth } from 'ui-sdk';
import {
  assetsApi,
  authApi,
  type RoleListItem,
  rolesApi,
  type SeoSettings,
  settingsApi,
  type TrackingSettings,
  trackingApi,
  type UserListItem,
  usersApi,
} from 'ui-sdk';
import { updateApi } from 'ui-sdk';
import { cn } from '@/lib/utils';

function ProfileCard() {
  const { t } = useTranslation();
  const { user, refresh } = useAuth();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user !== null) {
      setName(user.name);
      setEmail(user.email ?? '');
    }
  }, [user?.name, user?.email, user?.id]);

  const save = useMutation({
    mutationFn: () =>
      authApi.profile({
        name: name.trim(),
        email: email.trim() === '' ? null : email.trim(),
      }),
    onSuccess: () => {
      setError(null);
      setDone(true);
      refresh();
    },
    onError: err => {
      setDone(false);
      setError(
        err instanceof ApiError
          ? (err.data.error ?? t('settings.profileError'))
          : t('settings.profileError'),
      );
    },
  });

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) {
      return;
    }

    setAvatarBusy(true);
    setError(null);
    setDone(false);

    try {
      const blob = await makeAvatarThumb(file);
      if (blob === null) {
        throw new Error('thumbnail failed');
      }
      const formData = new FormData();
      formData.append('avatar', blob, 'avatar.webp');
      await authApi.avatar(formData);
      setDone(true);
      refresh();
    } catch {
      setError(t('settings.avatarError'));
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarBusy(true);
    setError(null);
    setDone(false);

    try {
      await authApi.removeAvatar();
      setDone(true);
      refresh();
    } catch {
      setError(t('settings.avatarError'));
    } finally {
      setAvatarBusy(false);
    }
  }

  if (user === null) {
    return null;
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardAction>
          <UserRound className="size-5 text-muted-foreground" />
        </CardAction>
        <CardTitle>{t('settings.editProfileTitle')}</CardTitle>
        <CardDescription>{user.username}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <img
            src={user.avatar_url}
            alt=""
            className="size-16 shrink-0 rounded-full bg-muted object-cover"
          />
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={avatarBusy}
                onClick={() => avatarInputRef.current?.click()}
              >
                {avatarBusy ? <Loader2 className="animate-spin" /> : <Upload />}
                {t('settings.profileUploadAvatar')}
              </Button>
              {user.has_avatar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={avatarBusy}
                  onClick={handleRemoveAvatar}
                >
                  {t('settings.profileRemoveAvatar')}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t('settings.profileAvatarHint')}</p>
          </div>
        </div>

        <form
          className="space-y-3"
          onSubmit={event => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">{t('settings.profileName')}</Label>
              <Input
                id="profile-name"
                value={name}
                onChange={event => setName(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">{t('settings.profileEmail')}</Label>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
              <p className="text-xs text-muted-foreground">{t('settings.profileEmailHint')}</p>
            </div>
          </div>

          {error !== null && <p className="text-sm text-destructive">{error}</p>}
          {done && <p className="text-sm text-emerald-600">{t('settings.profileSaved')}</p>}

          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
            {t('settings.profileSave')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function ChangePasswordForm() {
  const { t } = useTranslation();
  const { user, changePassword } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    if (next !== confirm) {
      setError(t('changePassword.mismatch'));
      return;
    }

    setPending(true);
    setError(null);

    try {
      await changePassword(next, current);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.data.error ?? t('changePassword.error'))
          : t('changePassword.error'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{t('settings.passwordTitle')}</CardTitle>
        <CardDescription>{t('settings.passwordDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="settings-current">{t('changePassword.current')}</Label>
            <Input
              id="settings-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={event => setCurrent(event.target.value)}
              required={!user?.must_change_password}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="settings-new">{t('changePassword.new')}</Label>
              <Input
                id="settings-new"
                type="password"
                autoComplete="new-password"
                value={next}
                onChange={event => setNext(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="settings-confirm">{t('changePassword.confirm')}</Label>
              <Input
                id="settings-confirm"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={event => setConfirm(event.target.value)}
                required
              />
            </div>
          </div>
          {error !== null && <p className="text-sm text-destructive">{error}</p>}
          {done && <p className="text-sm text-emerald-600">{t('settings.passwordDone')}</p>}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t('changePassword.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RoleCheckboxes({
  selected,
  onChange,
  roles,
}: {
  selected: number[];
  onChange: (ids: number[]) => void;
  roles: RoleListItem[];
}) {
  function toggle(id: number) {
    onChange(
      selected.includes(id) ? selected.filter(existing => existing !== id) : [...selected, id],
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {roles.map(role => (
        <label key={role.id} className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(role.id)}
            onChange={() => toggle(role.id)}
            className="size-3.5 rounded border-input accent-primary"
          />
          {role.code}
        </label>
      ))}
    </div>
  );
}

function UserRow({ user, roles }: { user: UserListItem; roles: RoleListItem[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [expanded, setExpanded] = useState(false);
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [resetPassword, setResetPassword] = useState('');
  const [rowError, setRowError] = useState<string | null>(null);

  const roleIdByCode = new Map(roles.map(r => [r.code, r.id]));

  function open() {
    setRoleIds(
      user.roles.map(code => roleIdByCode.get(code)).filter((id): id is number => id !== undefined),
    );
    setExpanded(value => !value);
  }

  const setRoles = useMutation({
    mutationFn: () => usersApi.setRoles(user.id, roleIds),
    onSuccess: () => {
      setRowError(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: err => {
      setRowError(
        err instanceof ApiError
          ? (err.data.error ?? t('settings.userError'))
          : t('settings.userError'),
      );
    },
  });

  const toggleActive = useMutation({
    mutationFn: () => usersApi.update({ id: user.id, is_active: !user.is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => usersApi.update({ id: user.id, password: resetPassword }),
    onSuccess: () => {
      setResetPassword('');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: err => {
      setRowError(
        err instanceof ApiError
          ? (err.data.error ?? t('settings.userError'))
          : t('settings.userError'),
      );
    },
  });

  return (
    <li className="rounded-lg bg-muted/50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="truncate">{user.username}</span>
            {user.roles.map(role => (
              <Badge key={role} variant="secondary">
                {role}
              </Badge>
            ))}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {user.name}
            {user.email ? ` · ${user.email}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={user.is_active ? 'default' : 'outline'}>
            {user.is_active ? t('settings.active') : t('settings.inactive')}
          </Badge>
          {user.must_change_password && (
            <Badge variant="destructive">{t('settings.mustChange')}</Badge>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={expanded}
            onClick={open}
          >
            <ChevronDown className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border/60 pt-3">
          <div className="space-y-1.5">
            <Label>{t('settings.rolesField')}</Label>
            <RoleCheckboxes selected={roleIds} onChange={setRoleIds} roles={roles} />
            <Button
              type="button"
              size="sm"
              onClick={() => setRoles.mutate()}
              disabled={setRoles.isPending}
            >
              {setRoles.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('settings.saveRoles')}
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`reset-${user.id}`}>{t('settings.resetPassword')}</Label>
            <div className="flex items-end gap-2">
              <Input
                id={`reset-${user.id}`}
                type="password"
                value={resetPassword}
                onChange={event => setResetPassword(event.target.value)}
                placeholder={t('settings.resetPlaceholder')}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => resetPasswordMutation.mutate()}
                disabled={resetPasswordMutation.isPending || resetPassword === ''}
              >
                {t('settings.reset')}
              </Button>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggleActive.mutate()}
            disabled={toggleActive.isPending}
          >
            {user.is_active ? t('settings.deactivate') : t('settings.activate')}
          </Button>

          {rowError !== null && <p className="text-sm text-destructive">{rowError}</p>}
        </div>
      )}
    </li>
  );
}

function UsersCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  });

  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
  });

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [roleIds, setRoleIds] = useState<number[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      usersApi.create({
        username: username.trim(),
        password,
        name: name.trim() || username.trim(),
        email: email.trim() === '' ? null : email.trim(),
        role_ids: roleIds,
      }),
    onSuccess: () => {
      setUsername('');
      setName('');
      setEmail('');
      setPassword('');
      setRoleIds([]);
      setFormError(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: err => {
      if (err instanceof ApiError) {
        setFormError(err.data.error ?? err.message);
      } else {
        setFormError(t('settings.userError'));
      }
    },
  });

  const roles = rolesQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardAction>
          <ShieldCheck className="size-5 text-muted-foreground" />
        </CardAction>
        <CardTitle>{t('settings.usersTitle')}</CardTitle>
        <CardDescription>{t('settings.usersDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form
          onSubmit={event => {
            event.preventDefault();
            create.mutate();
          }}
          className="space-y-3 rounded-xl bg-muted/40 p-4"
        >
          <p className="text-sm font-medium">{t('settings.addUser')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="new-username">{t('settings.newUsername')}</Label>
              <Input
                id="new-username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-name">{t('settings.newName')}</Label>
              <Input id="new-name" value={name} onChange={event => setName(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-email">{t('settings.newEmail')}</Label>
              <Input
                id="new-email"
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">{t('settings.newPassword')}</Label>
              <Input
                id="new-password"
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('settings.rolesField')}</Label>
            <RoleCheckboxes selected={roleIds} onChange={setRoleIds} roles={roles} />
          </div>
          {formError !== null && <p className="text-sm text-destructive">{formError}</p>}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? <Loader2 className="animate-spin" /> : <UserPlus />}
            {t('settings.createUser')}
          </Button>
        </form>

        {usersQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">{t('settings.loading')}</p>
        ) : (
          <ul className="space-y-2">
            {(usersQuery.data ?? []).map(user => (
              <UserRow key={user.id} user={user} roles={roles} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SeoSettingsCard() {
  const { t } = useTranslation();
  const [form, setForm] = useState<SeoSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const query = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
  });

  useEffect(() => {
    if (query.data !== undefined && form === null) {
      setForm(query.data);
    }
  }, [query.data, form]);

  const save = useMutation({
    mutationFn: (input: Partial<SeoSettings>) => settingsApi.update(input),
    onSuccess: () => {
      setError(null);
      setDone(true);
    },
    onError: err => {
      setDone(false);
      setError(
        err instanceof ApiError
          ? (err.data.error ?? t('seo.settingsError'))
          : t('seo.settingsError'),
      );
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (form === null) {
      return;
    }

    save.mutate({
      site_name: form.site_name.trim(),
      site_description: form.site_description.trim(),
      site_url: form.site_url.trim(),
      default_og_image: form.default_og_image.trim(),
      twitter_handle: form.twitter_handle.trim(),
      enable_sitemap: form.enable_sitemap,
      robots_content: form.robots_content,
    });
  }

  if (query.isLoading || form === null) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('settings.loading')}
        </CardContent>
      </Card>
    );
  }

  const seoUrl = (action: 'sitemap' | 'robots'): string => {
    const base = `${window.location.pathname}?p=sifpress/seo&action=${action}`;
    return base;
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardAction>
          <Search className="size-5 text-muted-foreground" />
        </CardAction>
        <CardTitle>{t('seo.settingsTitle')}</CardTitle>
        <CardDescription>{t('seo.settingsDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('seo.siteNameField')}
              </span>
              <Input
                value={form.site_name}
                onChange={event =>
                  setForm(prev =>
                    prev !== null ? { ...prev, site_name: event.target.value } : prev,
                  )
                }
                placeholder="Sifpress"
                className="h-9"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('seo.siteUrlField')}
              </span>
              <Input
                value={form.site_url}
                onChange={event =>
                  setForm(prev =>
                    prev !== null ? { ...prev, site_url: event.target.value } : prev,
                  )
                }
                placeholder="https://example.com/index.php"
                className="h-9"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('seo.siteDescriptionField')}
            </span>
            <textarea
              value={form.site_description}
              onChange={event =>
                setForm(prev =>
                  prev !== null ? { ...prev, site_description: event.target.value } : prev,
                )
              }
              placeholder={t('seo.siteDescriptionPlaceholder')}
              className="min-h-20 w-full resize-y rounded-xl border border-input bg-background p-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('seo.defaultOgImageField')}
              </span>
              <Input
                value={form.default_og_image}
                onChange={event =>
                  setForm(prev =>
                    prev !== null ? { ...prev, default_og_image: event.target.value } : prev,
                  )
                }
                placeholder="https://example.com/og.png"
                className="h-9"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('seo.twitterHandleField')}
              </span>
              <Input
                value={form.twitter_handle}
                onChange={event =>
                  setForm(prev =>
                    prev !== null ? { ...prev, twitter_handle: event.target.value } : prev,
                  )
                }
                placeholder="@sifpress"
                className="h-9"
              />
            </label>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border/60 p-3">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t('seo.enableSitemapField')}</p>
              <p className="text-xs text-muted-foreground">{t('seo.enableSitemapHint')}</p>
            </div>
            <Switch
              checked={form.enable_sitemap === '1'}
              onCheckedChange={checked =>
                setForm(prev =>
                  prev !== null ? { ...prev, enable_sitemap: checked ? '1' : '0' } : prev,
                )
              }
              aria-label={t('seo.enableSitemapField')}
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Button asChild variant="outline" size="xs">
              <a href={seoUrl('sitemap')} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                {t('seo.viewSitemap')}
              </a>
            </Button>
            <Button asChild variant="outline" size="xs">
              <a href={seoUrl('robots')} target="_blank" rel="noopener noreferrer">
                <ExternalLink />
                {t('seo.viewRobots')}
              </a>
            </Button>
          </div>

          {error !== null && <p className="text-sm text-destructive">{error}</p>}
          {done && <p className="text-sm text-muted-foreground">{t('seo.saved')}</p>}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('seo.save')}
            </Button>
          </div>
        </form>

        <label className="flex flex-col gap-1.5 border-t border-border/60 pt-4">
          <span className="text-xs font-medium text-muted-foreground">{t('seo.robotsField')}</span>
          <textarea
            value={form.robots_content}
            onChange={event =>
              setForm(prev =>
                prev !== null ? { ...prev, robots_content: event.target.value } : prev,
              )
            }
            placeholder={t('seo.robotsPlaceholder')}
            className="min-h-24 w-full resize-y rounded-xl border border-input bg-background p-3 font-mono text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
            spellCheck={false}
          />
        </label>
      </CardContent>
    </Card>
  );
}

function TrackingSettingsCard() {
  const { t } = useTranslation();
  const [form, setForm] = useState<TrackingSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const query = useQuery({
    queryKey: ['tracking-settings'],
    queryFn: trackingApi.get,
  });

  useEffect(() => {
    if (query.data !== undefined && form === null) {
      setForm(query.data);
    }
  }, [query.data, form]);

  const save = useMutation({
    mutationFn: (input: Partial<TrackingSettings>) => trackingApi.update(input),
    onSuccess: () => {
      setError(null);
      setDone(true);
    },
    onError: err => {
      setDone(false);
      setError(
        err instanceof ApiError
          ? (err.data.error ?? t('tracking.settingsError'))
          : t('tracking.settingsError'),
      );
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setDone(false);

    if (form === null) {
      return;
    }

    save.mutate({
      enabled: form.enabled,
      provider: form.provider,
      id: form.id.trim(),
      script_url: form.script_url.trim(),
      anonymize_ip: form.anonymize_ip,
    });
  }

  if (query.isLoading || form === null) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('settings.loading')}
        </CardContent>
      </Card>
    );
  }

  const showId = form.provider !== '';

  return (
    <Card size="sm">
      <CardHeader>
        <CardAction>
          <BarChart3 className="size-5 text-muted-foreground" />
        </CardAction>
        <CardTitle>{t('tracking.title')}</CardTitle>
        <CardDescription>{t('tracking.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">{t('tracking.enabledField')}</p>
              <p className="text-xs text-muted-foreground">{t('tracking.enabledHint')}</p>
            </div>
            <Switch
              checked={form.enabled === '1'}
              onCheckedChange={checked =>
                setForm(prev => (prev !== null ? { ...prev, enabled: checked ? '1' : '0' } : prev))
              }
              aria-label={t('tracking.enabledField')}
            />
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('tracking.providerField')}
            </span>
            <Select
              value={form.provider}
              onValueChange={value =>
                setForm(prev => (prev !== null ? { ...prev, provider: value } : prev))
              }
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder={t('tracking.providerPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gtag">{t('tracking.providerGtag')}</SelectItem>
                <SelectItem value="plausible">{t('tracking.providerPlausible')}</SelectItem>
                <SelectItem value="fathom">{t('tracking.providerFathom')}</SelectItem>
                <SelectItem value="matomo">{t('tracking.providerMatomo')}</SelectItem>
              </SelectContent>
            </Select>
          </label>

          {showId && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {t('tracking.idField')}
              </span>
              <Input
                value={form.id}
                onChange={event =>
                  setForm(prev => (prev !== null ? { ...prev, id: event.target.value } : prev))
                }
                placeholder={t('tracking.idPlaceholder')}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">{t('tracking.idHint')}</p>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {t('tracking.scriptUrlField')}
            </span>
            <Input
              value={form.script_url}
              onChange={event =>
                setForm(prev =>
                  prev !== null ? { ...prev, script_url: event.target.value } : prev,
                )
              }
              placeholder={t('tracking.scriptUrlPlaceholder')}
              className="h-9"
            />
            <p className="text-xs text-muted-foreground">{t('tracking.scriptUrlHint')}</p>
          </label>

          {form.provider === 'gtag' && (
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">{t('tracking.anonymizeIpField')}</p>
                <p className="text-xs text-muted-foreground">{t('tracking.anonymizeIpHint')}</p>
              </div>
              <Switch
                checked={form.anonymize_ip === '1'}
                onCheckedChange={checked =>
                  setForm(prev =>
                    prev !== null ? { ...prev, anonymize_ip: checked ? '1' : '0' } : prev,
                  )
                }
                aria-label={t('tracking.anonymizeIpField')}
              />
            </div>
          )}

          {error !== null && <p className="text-sm text-destructive">{error}</p>}
          {done && <p className="text-sm text-muted-foreground">{t('tracking.saved')}</p>}

          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {t('tracking.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function SystemSettingsCard() {
  const { i18n, t } = useTranslation();
  const current = i18n.language?.startsWith('zh') ? 'zh' : 'en';

  return (
    <Card size="sm">
      <CardHeader>
        <CardAction>
          <Globe className="size-5 text-muted-foreground" />
        </CardAction>
        <CardTitle>{t('settings.systemTitle')}</CardTitle>
        <CardDescription>{t('settings.systemDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t('settings.localeField')}</Label>
          <div className="flex flex-wrap gap-1.5">
            {(['en', 'zh'] as const).map(lang => (
              <button
                key={lang}
                type="button"
                onClick={() => i18n.changeLanguage(lang)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  current === lang
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {lang === 'en' ? 'English' : '中文'}
              </button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const FAVICON_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif';

function FaviconCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState<'favicon' | 'apple' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const appleInputRef = useRef<HTMLInputElement>(null);

  const query = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
  });

  const faviconId = query.data?.favicon_asset_id ?? '';
  const appleId = query.data?.apple_touch_icon_asset_id ?? '';
  const faviconVersion = query.data?.favicon_version ?? '0';

  function faviconUrl(id: string): string {
    if (id === '' || id === '0') {
      return '';
    }
    const params = new URLSearchParams({ p: 'sifpress/asset', id, t: faviconVersion });
    return `${window.location.pathname}?${params.toString()}`;
  }

  async function handleUpload(type: 'favicon' | 'apple', file: File) {
    setUploading(type);
    setError(null);
    setDone(false);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await assetsApi.create(formData);
      const assetId = String(result.asset.id);

      if (type === 'favicon') {
        await settingsApi.update({ favicon_asset_id: assetId });
      } else {
        await settingsApi.update({ apple_touch_icon_asset_id: assetId });
      }

      queryClient.invalidateQueries({ queryKey: ['seo-settings'] });
      setDone(true);
    } catch {
      setError(t('favicon.uploadError'));
    } finally {
      setUploading(null);
    }
  }

  function handleFileChange(type: 'favicon' | 'apple', event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    void handleUpload(type, file);
  }

  async function handleRemove(type: 'favicon' | 'apple') {
    setError(null);
    setDone(false);

    try {
      if (type === 'favicon') {
        await settingsApi.update({ favicon_asset_id: '' });
      } else {
        await settingsApi.update({ apple_touch_icon_asset_id: '' });
      }
      queryClient.invalidateQueries({ queryKey: ['seo-settings'] });
      setDone(true);
    } catch {
      setError(t('favicon.error'));
    }
  }

  if (query.isLoading) {
    return (
      <Card size="sm">
        <CardContent className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('settings.loading')}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardAction>
          <Image className="size-5 text-muted-foreground" />
        </CardAction>
        <CardTitle>{t('favicon.title')}</CardTitle>
        <CardDescription>{t('favicon.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <Label>{t('favicon.faviconLabel')}</Label>
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50">
              {faviconId !== '' && faviconId !== '0' ? (
                <img src={faviconUrl(faviconId)} alt="" className="size-8 rounded object-contain" />
              ) : (
                <Image className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept={FAVICON_ACCEPT}
                  className="hidden"
                  onChange={event => handleFileChange('favicon', event)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading !== null}
                  onClick={() => faviconInputRef.current?.click()}
                >
                  {uploading === 'favicon' ? <Loader2 className="animate-spin" /> : <Upload />}
                  {uploading === 'favicon' ? t('favicon.uploading') : t('favicon.upload')}
                </Button>
                {faviconId !== '' && faviconId !== '0' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading !== null}
                    onClick={() => handleRemove('favicon')}
                  >
                    {t('favicon.remove')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t('favicon.faviconHint')}</p>
            </div>
          </div>
        </div>

        <div className="space-y-3 border-t border-border/60 pt-4">
          <Label>{t('favicon.appleTouchLabel')}</Label>
          <div className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/50">
              {appleId !== '' && appleId !== '0' ? (
                <img src={faviconUrl(appleId)} alt="" className="size-8 rounded object-contain" />
              ) : (
                <Image className="size-5 text-muted-foreground" />
              )}
            </div>
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={appleInputRef}
                  type="file"
                  accept={FAVICON_ACCEPT}
                  className="hidden"
                  onChange={event => handleFileChange('apple', event)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={uploading !== null}
                  onClick={() => appleInputRef.current?.click()}
                >
                  {uploading === 'apple' ? <Loader2 className="animate-spin" /> : <Upload />}
                  {uploading === 'apple' ? t('favicon.uploading') : t('favicon.upload')}
                </Button>
                {appleId !== '' && appleId !== '0' && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading !== null}
                    onClick={() => handleRemove('apple')}
                  >
                    {t('favicon.remove')}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{t('favicon.appleTouchHint')}</p>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">{t('favicon.formats')}</p>

        {error !== null && <p className="text-sm text-destructive">{error}</p>}
        {done && <p className="text-sm text-muted-foreground">{t('favicon.saved')}</p>}
      </CardContent>
    </Card>
  );
}

function UpdateCard() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const status = useQuery({
    queryKey: ['update', 'status'],
    queryFn: updateApi.status,
    staleTime: 30_000,
  });

  const run = useMutation({
    mutationFn: updateApi.run,
    onSuccess: () => {
      setConfirmOpen(false);
      toast.success(t('update.done'));
      queryClient.invalidateQueries({ queryKey: ['update', 'status'] });
    },
    onError: err => {
      setConfirmOpen(false);
      toast.error(
        err instanceof ApiError && err.data.error
          ? err.data.error === 'checksum mismatch'
            ? t('update.checksumMismatch')
            : err.data.error
          : t('update.runError'),
      );
    },
  });

  const data = status.data;

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardAction>
            <Globe className="size-5 text-muted-foreground" />
          </CardAction>
          <CardTitle>{t('update.aboutTitle')}</CardTitle>
          <CardDescription>{t('update.aboutDescription')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <p className="font-heading text-lg font-semibold">{t('update.aboutName')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('update.aboutText')}</p>
          </div>
          <a
            href="https://github.com/liyu1981/sifpress"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-foreground transition-colors hover:text-muted-foreground hover:underline"
          >
            <ExternalLink className="size-3.5" />
            {t('update.aboutGithub')}
          </a>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardAction>
            <ArrowDownToLine className="size-5 text-muted-foreground" />
          </CardAction>
          <CardTitle>{t('update.title')}</CardTitle>
          <CardDescription>{t('update.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data === undefined ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('update.checking')}
            </div>
          ) : (
            <>
              <dl className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">{t('update.current')}</dt>
                  <dd className="font-medium">{data.current_version}</dd>
                </div>
                {data.latest_version !== null && (
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-muted-foreground">{t('update.latest')}</dt>
                    <dd className="font-medium">{data.latest_version}</dd>
                  </div>
                )}
              </dl>

              {data.fetch_error !== null ? (
                <p className="text-sm text-destructive">
                  {data.fetch_error === 'network'
                    ? t('update.fetchNetwork')
                    : t('update.fetchBadJson')}
                </p>
              ) : data.update_available ? (
                <p className="text-sm font-medium text-amber-600">{t('update.available')}</p>
              ) : data.ahead ? (
                <p className="text-sm text-muted-foreground">{t('update.ahead')}</p>
              ) : (
                <p className="text-sm text-emerald-600">{t('update.upToDate')}</p>
              )}

              {data.update_available && (
                <>
                  {data.manifest?.notes != null && data.manifest.notes !== '' && (
                    <p className="text-sm text-muted-foreground">{data.manifest.notes}</p>
                  )}

                  {data.can_upgrade ? (
                    <div className="flex items-center gap-2">
                      {!confirmOpen ? (
                        <Button type="button" size="sm" onClick={() => setConfirmOpen(true)}>
                          <ArrowDownToLine />
                          {t('update.upgrade')}
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setConfirmOpen(false)}
                            disabled={run.isPending}
                          >
                            {t('editor.cancel')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            onClick={() => run.mutate()}
                            disabled={run.isPending}
                          >
                            {run.isPending ? (
                              <Loader2 className="animate-spin" />
                            ) : (
                              <ArrowDownToLine />
                            )}
                            {run.isPending ? t('update.upgrading') : t('update.upgrade')}
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-xl bg-muted/40 p-4 text-sm">
                      <p className="font-medium">{t('update.manualTitle')}</p>
                      <p className="text-muted-foreground">{t('update.manualHint')}</p>
                      {data.manifest?.url != null && (
                        <p className="flex flex-wrap items-center gap-2">
                          <Button asChild variant="outline" size="sm">
                            <a href={data.manifest.url} target="_blank" rel="noopener noreferrer">
                              <ArrowDownToLine />
                              {t('update.downloadUrl')}
                            </a>
                          </Button>
                          {data.manifest.md5 !== '' && (
                            <code className="break-all rounded bg-muted px-2 py-1 text-xs">
                              {data.manifest.md5}
                            </code>
                          )}
                        </p>
                      )}
                      <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
                        <li>{t('update.manualStepBackup')}</li>
                        <li>{t('update.manualStepDownload')}</li>
                        <li>{t('update.manualStepVerify')}</li>
                        <li>{t('update.manualStepReplace')}</li>
                        <li>{t('update.manualStepReload')}</li>
                      </ol>
                      <p className="text-xs text-muted-foreground">
                        {t('update.selfPath')}:{' '}
                        <code className="rounded bg-muted px-1.5 py-0.5">{data.self_path}</code>
                      </p>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

export function AccountManagementPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  usePageTitle(t('account.pageTitle'));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t('account.pageTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('account.pageDescription')}</p>
      </header>

      <Tabs defaultValue="profile" className="gap-6 md:flex-row">
        <TabsList className="w-fit flex-row gap-1 bg-transparent p-0 dark:bg-transparent md:h-auto md:w-44 md:flex-col md:items-stretch md:self-start">
          <TabsTrigger
            value="profile"
            className="group justify-end rounded-full border-transparent px-0 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none"
          >
            <span className="rounded-full px-3 py-1.5 transition-colors group-data-[state=active]:bg-accent group-data-[state=active]:text-accent-foreground">
              {t('account.tabProfile')}
            </span>
          </TabsTrigger>
          <TabsTrigger
            value="agent"
            className="group justify-end rounded-full border-transparent px-0 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none"
          >
            <span className="rounded-full px-3 py-1.5 transition-colors group-data-[state=active]:bg-accent group-data-[state=active]:text-accent-foreground">
              {t('account.tabAgent')}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="space-y-6">
          {user !== null && (
            <Card size="sm">
              <CardHeader>
                <CardAction>
                  <UserRound className="size-5 text-muted-foreground" />
                </CardAction>
                <CardTitle>{t('settings.profileTitle')}</CardTitle>
                <CardDescription>
                  {user.username}
                  {user.email ? ` · ${user.email}` : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {user.roles.map(role => (
                  <Badge key={role} variant="secondary">
                    {role}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <ProfileCard />

          <ChangePasswordForm />
        </TabsContent>

        <TabsContent value="agent" className="space-y-6">
          <AgentSettingsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export function AccountAdminPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  usePageTitle(t('account.adminPageTitle'));

  const canManageUsers = user?.permissions.includes('users.manage') ?? false;

  if (!canManageUsers) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {t('account.adminPageTitle')}
          </h1>
        </header>
        <Card size="sm">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            {t('account.adminForbidden')}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">
          {t('account.adminPageTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">{t('account.adminPageDescription')}</p>
      </header>

      <UsersCard />
    </div>
  );
}

export function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  usePageTitle(t('settings.title'));

  const canManageSettings = user?.permissions.includes('settings.manage') ?? false;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight">{t('settings.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('settings.description')}</p>
      </header>

      <Tabs defaultValue="system" className="gap-6 md:flex-row">
        <TabsList className="w-fit flex-row gap-1 bg-transparent p-0 dark:bg-transparent md:h-auto md:w-44 md:flex-col md:items-stretch md:self-start">
          <TabsTrigger
            value="system"
            className="group justify-end rounded-full border-transparent px-0 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none"
          >
            <span className="rounded-full px-3 py-1.5 transition-colors group-data-[state=active]:bg-accent group-data-[state=active]:text-accent-foreground">
              {t('settings.tabSystem')}
            </span>
          </TabsTrigger>
          {canManageSettings && (
            <TabsTrigger
              value="seo"
              className="group justify-end rounded-full border-transparent px-0 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none"
            >
              <span className="rounded-full px-3 py-1.5 transition-colors group-data-[state=active]:bg-accent group-data-[state=active]:text-accent-foreground">
                {t('seo.tab')}
              </span>
            </TabsTrigger>
          )}
          {canManageSettings && (
            <TabsTrigger
              value="tracking"
              className="group justify-end rounded-full border-transparent px-0 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none"
            >
              <span className="rounded-full px-3 py-1.5 transition-colors group-data-[state=active]:bg-accent group-data-[state=active]:text-accent-foreground">
                {t('tracking.tab')}
              </span>
            </TabsTrigger>
          )}
          {user !== null && user.roles.includes('admin') && (
            <TabsTrigger
              value="update"
              className="group justify-end rounded-full border-transparent px-0 data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent dark:data-[state=active]:shadow-none"
            >
              <span className="rounded-full px-3 py-1.5 transition-colors group-data-[state=active]:bg-accent group-data-[state=active]:text-accent-foreground">
                {t('update.tab')}
              </span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="system" className="space-y-6">
          <SystemSettingsCard />
          <FaviconCard />
        </TabsContent>

        {canManageSettings && (
          <TabsContent value="seo" className="space-y-6">
            <SeoSettingsCard />
          </TabsContent>
        )}

        {canManageSettings && (
          <TabsContent value="tracking" className="space-y-6">
            <TrackingSettingsCard />
          </TabsContent>
        )}

        {user !== null && user.roles.includes('admin') && (
          <TabsContent value="update">
            <UpdateCard />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
