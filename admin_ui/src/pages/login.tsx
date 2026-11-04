import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, Loader2, LogIn } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePageTitle } from '@/hooks/use-page-title';
import { socialErrorMessage, socialFlagFromUrl } from '@/lib/social';
import { ApiError } from 'ui-sdk';
import { authApi, socialStartUrl } from 'ui-sdk';
import { useAuth } from 'ui-sdk';

export function LoginPage({ next }: { next?: string }) {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const navigate = useNavigate();

  usePageTitle(t('login.title'));

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /*
   * A failed social sign-in bounces back here with ?social_error=<code>; keep
   * it visible until the user submits the password form.
   */
  const [socialError, setSocialError] = useState<string | null>(() =>
    socialFlagFromUrl('social_error'),
  );

  const providers = useQuery({
    queryKey: ['auth', 'providers'],
    queryFn: authApi.socialProviders,
    staleTime: 60_000,
    retry: false,
  });

  /*
   * When a social provider is available it is the primary path: the buttons
   * come first and the username/password form starts collapsed, so the panel
   * leads with the one-click option and keeps the fallback one tap away. With
   * no provider configured the page is exactly the classic password form.
   */
  const socialProviders = providers.data ?? [];
  const hasSocial = socialProviders.length > 0;
  const [passwordOpen, setPasswordOpen] = useState(false);
  const showPasswordForm = !hasSocial || passwordOpen;
  const usernameRef = useRef<HTMLInputElement>(null);

  /* Expanding the disclosure unmounts the toggle, so put the caret in the
   * first field instead of leaving focus on the document body. */
  useEffect(() => {
    if (passwordOpen) {
      usernameRef.current?.focus();
    }
  }, [passwordOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    setPending(true);
    setError(null);
    setSocialError(null);

    try {
      await login(username.trim(), password);

      if (next !== undefined && next !== '/admin/login') {
        navigate({ to: next });
      } else {
        navigate({ to: '/admin' });
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(t('login.invalid'));
      } else {
        setError(t('login.error'));
      }
      setPending(false);
    }
  }

  if (user !== null && !user.must_change_password) {
    navigate({ to: '/admin' });
  }

  const nextRoute = next !== undefined && next !== '/admin/login' ? next : '/admin/sifront';

  const passwordForm = (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="login-username">{t('login.username')}</Label>
        <Input
          id="login-username"
          ref={usernameRef}
          autoComplete="username"
          value={username}
          onChange={event => setUsername(event.target.value)}
          required
          autoFocus={!hasSocial}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="login-password">{t('login.password')}</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          required
        />
      </div>

      {error !== null && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        {pending ? t('login.signingIn') : t('login.signIn')}
      </Button>
    </>
  );

  return (
    <div className="mx-auto flex w-full max-w-sm items-center justify-center py-16">
      <form onSubmit={handleSubmit} className="glass-control w-full rounded-2xl p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LogIn className="size-6" />
          </div>
          <div className="space-y-1">
            <Badge>{t('login.badge')}</Badge>
            <h1 className="font-heading text-2xl font-bold tracking-tight">{t('login.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('login.subtitle')}</p>
          </div>
        </div>

        <div className="space-y-4">
          {socialError !== null && (
            <p className="text-sm text-destructive">{socialErrorMessage(t, socialError)}</p>
          )}

          {/*
           * Wait for the provider list before choosing the layout: the query
           * resolves from the same origin in milliseconds, and rendering the
           * password form first would make it visibly collapse afterwards.
           */}
          {providers.isPending ? (
            <div className="flex justify-center py-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
            </div>
          ) : (
            <>
              {hasSocial && (
                <div className="space-y-2">
                  {socialProviders.map(provider => (
                    <Button key={provider.id} asChild variant="outline" className="w-full">
                      <a href={socialStartUrl(provider.id, { mode: 'login', next: nextRoute })}>
                        {t('social.continueWith', { provider: provider.name })}
                      </a>
                    </Button>
                  ))}
                </div>
              )}

              {hasSocial && (
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                  {t('social.or')}
                  <span className="h-px flex-1 bg-border" aria-hidden="true" />
                </div>
              )}

              {hasSocial && !showPasswordForm && (
                <button
                  type="button"
                  onClick={() => setPasswordOpen(true)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <ChevronDown className="size-3.5" aria-hidden="true" />
                  {t('login.usePassword')}
                </button>
              )}

              {showPasswordForm && (
                <>
                  {hasSocial && (
                    <button
                      type="button"
                      onClick={() => setPasswordOpen(false)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
                    >
                      <ChevronUp className="size-3.5" aria-hidden="true" />
                      {t('login.hidePasswordForm')}
                    </button>
                  )}
                  {passwordForm}
                </>
              )}
            </>
          )}
        </div>
      </form>
    </div>
  );
}
