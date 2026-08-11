import { Link, useParams } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { usePageTitle } from '@/hooks/use-page-title'
import { editorRoute } from '@/router'

export function EditorPage() {
  const { id } = useParams({ from: editorRoute.id })
  const { t } = useTranslation()

  usePageTitle(`${t('editor.title')} ${id}`)

  return (
    <Card>
      <CardHeader>
        <Badge className="w-fit">{t('editor.badge')}</Badge>
        <CardTitle className="text-3xl tracking-tight">
          {t('editor.title')}
        </CardTitle>
        <CardDescription>{t('editor.description', { id })}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm" variant="glass">
          <Link
            to="/editor/$id"
            params={{ id: String(Number(id) + 1) }}
          >
            {t('editor.next')}
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
