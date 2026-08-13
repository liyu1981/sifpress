import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Lock,
  Save,
  ShieldCheck,
  Trash2,
  UserPlus,
} from 'lucide-react'
import type { FormEvent } from 'react'

import { ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Markdown } from '@/components/markdown/markdown'
import { parseFrontMatter } from '@/lib/front-matter'
import { useAuth } from '@/lib/auth'
import { pagesApi, type Grant } from '@/lib/pages'
import { usePageTitle } from '@/hooks/use-page-title'

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface ParsedMeta {
  slug: string
  title: string
  date: string
  content_md: string
}

function parseMeta(
  markdown: string,
  t: (key: string) => string,
): { meta: ParsedMeta | null; errors: Record<string, string> } {
  const fm = parseFrontMatter(markdown)
  const errors: Record<string, string> = {}

  const title = typeof fm.data.title === 'string' ? fm.data.title.trim() : ''
  const slug = typeof fm.data.slug === 'string' ? fm.data.slug.trim() : ''
  const date = typeof fm.data.date === 'string' ? fm.data.date.trim() : ''

  if (title === '') {
    errors.title = t('editor.metaTitleRequired')
  }

  if (slug === '') {
    errors.slug = t('editor.metaSlugRequired')
  } else if (!SLUG_RE.test(slug)) {
    errors.slug = t('editor.slugInvalid')
  }

  if (date !== '' && !DATE_RE.test(date)) {
    errors.date = t('editor.metaDateInvalid')
  }

  if (Object.keys(errors).length > 0) {
    return { meta: null, errors }
  }

  return {
    meta: {
      slug,
      title,
      date,
      content_md: markdown,
    },
    errors: {},
  }
}

function errorMessages(error: ApiError | null): string[] {
  if (error === null) {
    return []
  }

  const messages = Object.values(error.data.errors ?? {}).flat()

  return messages.length > 0 ? messages : error.data.error ? [error.data.error] : []
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
  grant: Grant
  index: number
  onSave: (permission: 'edit' | 'view') => void
  onRevoke: () => void
  saving: boolean
}) {
  const { t } = useTranslation()
  const [permission, setPermission] = useState<'edit' | 'view'>(grant.permission)

  useEffect(() => {
    setPermission(grant.permission)
  }, [grant.permission])

  const isFixed = grant.kind !== 'grant'
  const isGuest = grant.username === '_guest_'
  const changed = !isFixed && permission !== grant.permission
  const label =
    grant.username === '_guest_'
      ? grant.name || t('editor.websiteGuest')
      : grant.username === 'admin'
        ? t('editor.websiteAdmin')
        : grant.username
  const note = grant.note ?? (grant.granted_by_name ? t('editor.grantBy', { name: grant.granted_by_name }) : '')

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
        <select
          value={isFixed ? 'edit' : permission}
          onChange={(event) =>
            setPermission(event.target.value as 'edit' | 'view')
          }
          disabled={isFixed}
          aria-label={t('editor.grantPermissionField')}
          className="h-7 rounded-md border border-input bg-transparent px-1.5 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="edit">{t('editor.permissionEdit')}</option>
          <option value="view">{t('editor.permissionView')}</option>
        </select>
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
  )
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
  )
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

  const [content, setContent] = useState('')
  const [published, setPublished] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saveError, setSaveError] = useState<ApiError | null>(null)
  const [accessOpen, setAccessOpen] = useState(false)
  const [grantUsername, setGrantUsername] = useState('')
  const [grantPermission, setGrantPermission] = useState<'edit' | 'view'>('edit')
  const [grantNote, setGrantNote] = useState('')
  const [grantError, setGrantError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (!editing || loaded || pageQuery.data === undefined) {
      return
    }

    const page = pageQuery.data

    if (page !== null) {
      setContent(page.content_md)
      setPublished(page.status === 'published')
    }

    setLoaded(true)
  }, [editing, loaded, pageQuery.data])

  const save = useMutation({
    mutationFn: async (meta: ParsedMeta & { status: 'published' | 'draft' }) => {
      const base = {
        slug: meta.slug,
        title: meta.title,
        status: meta.status,
        content_md: meta.content_md,
        created_at: meta.date !== '' ? `${meta.date} 00:00:00` : '',
        updated_at: '',
      }

      return editing
        ? pagesApi.update({ id: pageQuery.data!.id, ...base })
        : pagesApi.create(base)
    },
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

    const { meta, errors } = parseMeta(content, t)

    if (meta === null) {
      const fieldErrors = Object.fromEntries(
        Object.entries(errors).map(([field, message]) => [field, [message]]),
      )
      setSaveError(new ApiError(422, { error: t('editor.metaInvalid'), errors: fieldErrors }))
      return
    }

    save.mutate({ ...meta, status: published ? 'published' : 'draft' })
  }

  const page = pageQuery.data ?? null
  const canManageGrants = page !== null && (isAdmin || page.created_by === user?.id)

  const grantsQuery = useQuery({
    queryKey: ['page-grants', page?.id],
    queryFn: () => pagesApi.grants(page!.id),
    enabled: editing && page !== null && canManageGrants,
  })

  const grant = useMutation({
    mutationFn: (args: {
      username: string
      permission: 'edit' | 'view'
      note?: string
    }) => pagesApi.grant(page!.id, args.username, args.permission, args.note),
    onSuccess: () => {
      setGrantError(null)
      queryClient.invalidateQueries({ queryKey: ['page-grants', page?.id] })
    },
    onError: (err) => {
      setGrantError(err instanceof ApiError ? err : null)
    },
  })

  function handleAddGrant() {
    grant.mutate({
      username: grantUsername.trim(),
      permission: grantPermission,
      note: grantNote,
    })
    setGrantUsername('')
    setGrantPermission('edit')
    setGrantNote('')
  }

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

  const messages = errorMessages(saveError)

  return (
    <div className="flex h-full w-full flex-col">
      <form onSubmit={handleSave} className="flex h-full flex-col">
        <div className="mx-auto w-full max-w-5xl shrink-0 space-y-4">
          <h1 className="font-heading text-3xl font-bold tracking-tight">
            {editing ? t('editor.editTitle') : t('editor.newTitle')}
          </h1>

          {!editing && (
            <p className="text-sm text-muted-foreground">{t('editor.newHint')}</p>
          )}

          {editing && page !== null && canManageGrants && (
            <div className="glass-control rounded-2xl">
              <button
                type="button"
                onClick={() => setAccessOpen((value) => !value)}
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
                  <p className="text-xs text-muted-foreground">
                    {t('editor.grantsDescription')}
                  </p>

                  <div className="overflow-x-auto rounded-xl border-2 border-black/25 dark:border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b-2 border-black/25 text-left text-xs text-muted-foreground dark:border-border">
                          <th className="px-3 py-2 font-medium">
                            {t('editor.grantUsername')}
                          </th>
                          <th className="px-3 py-2 font-medium">
                            {t('editor.grantPermissionField')}
                          </th>
                          <th className="px-3 py-2 font-medium">
                            {t('editor.grantNote')}
                          </th>
                          <th className="px-3 py-2 font-medium" />
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-black/25 dark:border-border">
                          <td className="px-3 py-2">
                            <Input
                              value={grantUsername}
                              onChange={(event) => setGrantUsername(event.target.value)}
                              placeholder={t('editor.grantPlaceholder')}
                              className="h-8"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={grantPermission}
                              onChange={(event) =>
                                setGrantPermission(event.target.value as 'edit' | 'view')
                              }
                              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                            >
                              <option value="edit">{t('editor.permissionEdit')}</option>
                              <option value="view">{t('editor.permissionView')}</option>
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              value={grantNote}
                              onChange={(event) => setGrantNote(event.target.value)}
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
                            onSave={(permission) =>
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
                            <td
                              colSpan={4}
                              className="py-2 text-sm text-muted-foreground"
                            >
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
              {messages.map((message) => (
                <p key={message}>{message}</p>
              ))}
            </div>
          )}
        </div>

        <div className="relative left-1/2 mt-6 w-[calc(100vw-2rem)] min-h-0 flex-1 -translate-x-1/2 px-6">
          <div className="grid h-full grid-rows-2 gap-4 lg:grid-cols-2 lg:grid-rows-1">
            <div className="glass-control flex min-h-0 flex-col overflow-hidden rounded-2xl">
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/60 px-4 py-2">
                <span className="text-sm font-medium">{t('editor.contentField')}</span>
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-2">
                    <Switch
                      checked={published}
                      onCheckedChange={setPublished}
                      aria-label={t('editor.statusField')}
                    />
                    <span className="text-sm font-medium">
                      {published
                        ? t('editor.statusPublished')
                        : t('editor.statusDraft')}
                    </span>
                  </label>
                  {editing && page !== null && has('pages.delete') && (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleDelete}
                      disabled={remove.isPending}
                    >
                      {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      {t('editor.delete')}
                    </Button>
                  )}
                  <Button type="submit" size="sm" disabled={save.isPending}>
                    {save.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    {t('editor.save')}
                  </Button>
                </div>
              </div>
              <textarea
                aria-label={t('editor.contentField')}
                className="w-full min-h-0 flex-1 resize-none bg-transparent p-4 font-mono text-sm leading-6 outline-none placeholder:text-muted-foreground"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={t('editor.contentPlaceholder')}
                spellCheck={false}
              />
            </div>

            <div className="glass-control flex min-h-0 flex-col overflow-hidden rounded-2xl">
              <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-2">
                <span className="text-sm font-medium">{t('editor.preview')}</span>
                <Badge variant="outline">{t('editor.previewLive')}</Badge>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="prose max-w-none p-6 text-[0.9rem] leading-7">
                  {content.trim() === '' ? (
                    <p className="text-muted-foreground">
                      {t('editor.previewEmpty')}
                    </p>
                  ) : (
                    <Markdown content={content} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  )
}
