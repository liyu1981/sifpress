import { KeyRound, Loader2 } from 'lucide-react';
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

/**
 * Forced password change screen. The backend locks every action while
 * the seeded admin still has must_change_password set; this screen is
 * the only way out.
 */
export function ChangePasswordPage() {
  const { t } = useTranslation();
  const { user, changePassword } = useAuth();

  usePageTitle(t('changePassword.title'));

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      await changePassword(next, user?.must_change_password ? undefined : current);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError(err.data.error ?? t('changePassword.error'));
      } else {
        setError(t('changePassword.error'));
      }
      setPending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-sm items-center justify-center py-16">
      <form onSubmit={handleSubmit} className="glass-control w-full rounded-2xl p-8">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="size-6" />
          </div>
          <div className="space-y-1">
            <Badge variant="destructive">{t('changePassword.required')}</Badge>
            <h1 className="font-heading text-2xl font-bold tracking-tight">
              {t('changePassword.title')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('changePassword.description')}</p>
          </div>
        </div>

        <div className="space-y-4">
          {user !== null && !user.must_change_password && (
            <div className="space-y-1.5">
              <Label htmlFor="cp-current">{t('changePassword.current')}</Label>
              <Input
                id="cp-current"
                type="password"
                autoComplete="current-password"
                value={current}
                onChange={event => setCurrent(event.target.value)}
                required
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="cp-new">{t('changePassword.new')}</Label>
            <Input
              id="cp-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={event => setNext(event.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">{t('changePassword.hint')}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">{t('changePassword.confirm')}</Label>
            <Input
              id="cp-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={event => setConfirm(event.target.value)}
              required
            />
          </div>

          {error !== null && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {pending ? t('changePassword.saving') : t('changePassword.save')}
          </Button>
        </div>
      </form>
    </div>
  );
}
