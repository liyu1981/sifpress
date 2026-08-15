import { Link, useLocation } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { usePageTitle } from '@/hooks/use-page-title';

export function NotFoundPage() {
  const { t } = useTranslation();

  usePageTitle(t('notFound.title'));

  const location = useLocation();

  return (
    <div className="mx-auto w-full max-w-xl">
      <Card>
        <CardHeader>
          <Badge className="w-fit">{t('notFound.badge')}</Badge>
          <CardTitle className="text-3xl tracking-tight">{t('notFound.title')}</CardTitle>
          <CardDescription>{t('notFound.description', { href: location.href })}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="sm" variant="glass">
            <Link to="/">{t('notFound.back')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
