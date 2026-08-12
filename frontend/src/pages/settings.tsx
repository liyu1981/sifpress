import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { FormEvent } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createProject } from '@/lib/api'
import { usePageTitle } from '@/hooks/use-page-title'

export function SettingsPage() {
  const { t } = useTranslation()

  usePageTitle(t('settings.title'))

  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [created, setCreated] = useState<{ id: number; name: string } | null>(
    null,
  )

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (data) => {
      setCreated(data)
      setName('')
      queryClient.invalidateQueries({ queryKey: ['api', 'projects'] })
    },
  })

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (name.trim() !== '') {
      mutation.mutate(name.trim())
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <Card>
        <CardHeader>
          <Badge className="w-fit">{t('settings.badge')}</Badge>
          <CardTitle className="text-3xl tracking-tight">
            {t('settings.title')}
          </CardTitle>
          <CardDescription>{t('settings.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="flex items-end gap-3" onSubmit={handleSubmit}>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="project-name">{t('settings.name')}</Label>
              <Input
                id="project-name"
                value={name}
                placeholder={t('settings.placeholder')}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? t('settings.creating') : t('settings.create')}
            </Button>
          </form>

          <div className="space-y-1 rounded-lg bg-muted/50 p-4">
            <p className="text-sm font-medium">{t('settings.lastCreated')}</p>
            <p className="text-sm text-muted-foreground">
              {created ? `#${created.id} — ${created.name}` : '—'}
            </p>
            {mutation.isError && (
              <p className="text-sm text-destructive">{t('settings.error')}</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
