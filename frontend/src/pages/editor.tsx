import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2, Lock, Save, Trash2, UserPlus } from 'lucide-react'
import type { FormEvent } from 'react'

import { ApiError } from '@/lib/api'
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
import { Markdown } from '@/components/markdown/markdown'
import { useAuth } from '@/lib/auth'
import { pagesApi, type PageStatus } from '@/lib/pages'
import { usePageTitle } from '@/hooks/use-page-title'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

interface FormState {
  slug: string
  title: string
  status: PageStatus
  content_md: string
}

const emptyForm: FormState = {
  slug: '',
  title: '',
  status: 'draft',
  content_md: '',
}

function EditorSkeleton() {
  return (
    <div className="glass-control animate-pulse rounded-2xl">
      <div className="space-y-4 p-8">
        <div className="h-3 w-1/4 rounded bg-muted" />
        <div className="h-8 w-2/3 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-40 w-full rounded bg-muted" />
      </div>
    </div>
  )
}

function fieldError(
  error: ApiError | null,
  field: string,
): string | undefined {
  return error?.data.errors?.[field]?.[0]
}

export function EditorPage({ slug }: { slug: string | null }) {
  const { t } = useTranslation()
  const { user, has, isAdmin } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const editing = slug !== null
  usePageTitle(editing ? t('editor.editTitle') : t('editor.newTitle'))

  const pageQuery = useQuery({
    queryKey: ['page', slug ?? 'new'],
    queryFn: () => (slug ? pagesApi.get({ slug }) : Promise.resolve(null)),
    enabled: editing,
  })

  const [form, setForm] = useState<FormState>(emptyForm)
  const [loaded, setLoaded] = useState(false)
  const [saveError, setSaveError] = useState<ApiError | null>(null)
  const [grantUsername, setGrantUsername] = useState('')
  const [grantError, setGrantError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (!editing || loaded || pageQuery.data === undefined) {
      return
    }

    const page = pageQuery.data

    if (page !== null) {
      setForm({
        slug: page.slug,
        title: page.title,
        status: page.status,
        content_md: page.content_md,
      })
    }

    setLoaded(true)
  }, [editing, loaded, pageQuery.data])

  const save = useMutation({
    mutationFn: async (state: FormState) =>
      editing
        ? pagesApi.update({
            id: pageQuery.data!.id,
            slug: state.slug,
            title: state.title,
            status: state.status,
            content_md: state.content_md,
          })
        : pagesApi.create(state),
    onSuccess: (page) => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      queryClient.invalidateQueries({ queryKey: ['page', page.slug] })
      navigate({ to: '/article/$slug', params: { slug: page.slug } })
    },
    onError: (err) => {
      setSaveError(err instanceof ApiError ? err : null)
    },
  })

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaveError(null)

    if (!SLUG_RE.test(form.slug)) {
      setSaveError(
        new ApiError(422, {
          error: t('editor.slugInvalid'),
          errors: { slug: [t('editor.slugInvalid')] },
        }),
      )
      return
    }

    save.mutate(form)
  }

  const page = pageQuery.data ?? null
  const canManageGrants = page !== null && (isAdmin || page.created_by === user?.id)

  const grantsQuery = useQuery({
    queryKey: ['page-grants', page?.id],
    queryFn: () => pagesApi.grants(page!.id),
    enabled: editing && page !== null && canManageGrants,
  })

  const grant = useMutation({
    mutationFn: () => pagesApi.grant(page!.id, grantUsername.trim()),
    onSuccess: () => {
      setGrantUsername('')
      setGrantError(null)
      queryClient.invalidateQueries({ queryKey: ['page-grants', page?.id] })
    },
    onError: (err) => {
      setGrantError(err instanceof ApiError ? err : null)
    },
  })

  const revoke = useMutation({
    mutationFn: (username: string) => pagesApi.revokeGrant(page!.id, username),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-grants', page?.id] })
    },
  })

  const remove = useMutation({
    mutationFn: () => pagesApi.remove(page!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pages'] })
      navigate({ to: '/article' })
    },
  })

  function handleDelete() {
    if (window.confirm(t('editor.deleteConfirm'))) {
      remove.mutate()
    }
  }

  if (editing && pageQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <EditorSkeleton />
      </div>
    )
  }

  if (editing && pageQuery.data === null) {
    return (
      <div className="mx-auto w-full max-w-xl space-y-4 text-center">
        <Badge variant="outline">{t('editor.notFoundBadge')}</Badge>
        <h1 className="font-heading text-2xl font-bold">
          {t('editor.notFoundTitle')}
        </h1>
        <Button asChild variant="glass" size="sm">
          <Link to="/article">
            <ArrowLeft className="size-3.5" />
            {t('article.backToIndex')}
          </Link>
        </Button>
      </div>
    )
  }

  if (editing && page !== null && !page.can_edit) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 py-16 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
          <Lock className="size-6" />
        </div>
        <h1 className="font-heading text-2xl font-bold">
          {t('editor.forbiddenTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('editor.forbiddenDescription')}
        </p>
        <Button asChild variant="glass" size="sm">
          <Link to="/article/$slug" params={{ slug: page.slug }}>
            <ArrowLeft className="size-3.5" />
            {t('article.backToIndex')}
          </Link>
        </Button>
      </div>
    )
  }

  const slugError = fieldError(saveError, 'slug')
  const titleError = fieldError(saveError, 'title')

  return (
    <div className="mx-auto w-full max-w-5xl">
      <form onSubmit={handleSave} className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Badge variant={editing ? 'secondary' : 'default'}>
              {editing ? t('editor.editBadge') : t('editor.newBadge')}
            </Badge>
            <h1 className="font-heading text-3xl font-bold tracking-tight">
              {editing ? t('editor.editTitle') : t('editor.newTitle')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {editing && page !== null && has('pages.delete') && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={remove.isPending}
              >
                {remove.isPending ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                {t('editor.delete')}
              </Button>
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Save />
              )}
              {t('editor.save')}
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="glass-control space-y-4 rounded-2xl p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="editor-title">{t('editor.titleField')}</Label>
                <Input
                  id="editor-title"
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  aria-invalid={titleError !== undefined}
                  required
                />
                {titleError !== undefined && (
                  <p className="text-xs text-destructive">{titleError}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="editor-slug">{t('editor.slugField')}</Label>
                <Input
                  id="editor-slug"
                  value={form.slug}
                  onChange={(event) =>
                    setForm({ ...form, slug: event.target.value })
                  }
                  aria-invalid={slugError !== undefined}
                  placeholder="my-page"
                  required
                />
                {slugError !== undefined && (
                  <p className="text-xs text-destructive">{slugError}</p>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editor-status">{t('editor.statusField')}</Label>
              <select
                id="editor-status"
                className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={form.status}
                onChange={(event) =>
                  setForm({
                    ...form,
                    status: event.target.value as PageStatus,
                  })
                }
              >
                <option value="draft">{t('editor.statusDraft')}</option>
                <option value="published">{t('editor.statusPublished')}</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="editor-content">{t('editor.contentField')}</Label>
              <textarea
                id="editor-content"
                className="w-full min-h-72 rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={form.content_md}
                onChange={(event) =>
                  setForm({ ...form, content_md: event.target.value })
                }
                placeholder={t('editor.contentPlaceholder')}
                spellCheck={false}
              />
            </div>

            {saveError !== null && (
              <p className="text-sm text-destructive">
                {saveError.data.error ?? t('editor.error')}
              </p>
            )}
          </div>

          <div className="space-y-6">
            <div className="glass-control rounded-2xl p-6">
              <div className="mb-3 flex items-center justify-between">
                <Label>{t('editor.preview')}</Label>
                <Badge variant="outline">{t('editor.previewLive')}</Badge>
              </div>
              <div className="prose max-w-none overflow-hidden rounded-xl bg-background/50 p-4 text-[0.9rem] leading-6">
                {form.content_md.trim() === '' ? (
                  <p className="text-muted-foreground">
                    {t('editor.previewEmpty')}
                  </p>
                ) : (
                  <Markdown content={form.content_md} />
                )}
              </div>
            </div>

            {editing && page !== null && canManageGrants && (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>{t('editor.grantsTitle')}</CardTitle>
                  <CardDescription>
                    {t('editor.grantsDescription')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label htmlFor="grant-username">
                        {t('editor.grantUsername')}
                      </Label>
                      <Input
                        id="grant-username"
                        value={grantUsername}
                        onChange={(event) => setGrantUsername(event.target.value)}
                        placeholder={t('editor.grantPlaceholder')}
                      />
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => grant.mutate()}
                      disabled={grant.isPending || grantUsername.trim() === ''}
                    >
                      <UserPlus />
                      {t('editor.grantAdd')}
                    </Button>
                  </div>
                  {grantError !== null && (
                    <p className="text-sm text-destructive">
                      {grantError.data.error ?? t('editor.grantError')}
                    </p>
                  )}
                  <ul className="space-y-1.5">
                    {grantsQuery.data?.map((g) => (
                      <li
                        key={g.username}
                        className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2 text-sm"
                      >
                        <span>
                          <span className="font-medium">{g.username}</span>
                          <span className="text-xs text-muted-foreground">
                            {' — '}
                            {g.name}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => revoke.mutate(g.username)}
                          disabled={revoke.isPending}
                        >
                          {t('editor.grantRevoke')}
                        </Button>
                      </li>
                    ))}
                    {grantsQuery.data?.length === 0 && (
                      <li className="text-sm text-muted-foreground">
                        {t('editor.grantsEmpty')}
                      </li>
                    )}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </form>
    </div>
  )
}
