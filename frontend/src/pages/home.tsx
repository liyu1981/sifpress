import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { fetchHello, fetchTime } from '@/lib/api'

import { usePageTitle } from '@/hooks/use-page-title'

export function HomePage() {
  const { t } = useTranslation()

  usePageTitle(t('home.title'))

  const hello = useQuery({
    queryKey: ['api', 'hello'],
    queryFn: fetchHello,
  })

  const time = useQuery({
    queryKey: ['api', 'time'],
    queryFn: fetchTime,
  })

  return (
    <Card>
      <CardHeader>
        <Badge className="w-fit">{t('home.badge')}</Badge>
        <CardTitle className="text-3xl tracking-tight">
          {t('home.title')}
        </CardTitle>
        <CardDescription>{t('home.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">{t('home.url')}</p>
          <p className="text-sm text-muted-foreground">
            {window.location.pathname}
          </p>
        </div>

        <div className="space-y-1 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">{t('home.api')}</p>
          <p className="text-sm text-muted-foreground">
            {hello.isLoading ? t('home.loading') : hello.data?.message}
          </p>
        </div>

        <div className="space-y-1 rounded-lg bg-muted/50 p-4">
          <p className="text-sm font-medium">{t('home.time')}</p>
          <p className="text-sm text-muted-foreground">
            {time.isLoading ? t('home.loading') : time.data?.iso ?? '—'}
          </p>
        </div>

        <p className="text-xs text-muted-foreground">{t('home.hint')}</p>
      </CardContent>
    </Card>
  )
}
