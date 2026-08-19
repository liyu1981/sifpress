import { useNavigate } from '@tanstack/react-router';
import { Loader2, LogIn } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePageTitle } from '@/hooks/use-page-title';
import { ApiError } from 'ui-sdk';
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

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
          <div className="space-y-1.5">
            <Label htmlFor="login-username">{t('login.username')}</Label>
            <Input
              id="login-username"
              autoComplete="username"
              value={username}
              onChange={event => setUsername(event.target.value)}
              required
              autoFocus
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
        </div>
      </form>
    </div>
  );
}
