import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Check,
  Copy,
  Film,
  Loader2,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { ApiError, assetMarkdownLink, assetUrl } from '@/lib/api'
import { makeImageThumb, makeVideoThumb } from '@/lib/assets'
import { assetsApi, type Asset, type AssetKind } from '@/lib/pages'
import { useAuth } from '@/lib/auth'
import { usePageTitle } from '@/hooks/use-page-title'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const PER_PAGE = 24
const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,image/avif,video/mp4,video/webm,video/ogg'

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`
}

function formatDate(value: string, language: string): string {
  const date = new Date(value.replace(' ', 'T') + 'Z')
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

interface UploadItem {
  key: string
  file: File
  status: 'queued' | 'processing' | 'done' | 'error'
  error?: string
  duplicate?: boolean
}

function AssetThumb({ asset }: { asset: Asset }) {
  if (asset.has_thumb) {
    return (
      <img
        src={assetUrl(asset.id, true)}
        alt={asset.name}
        loading="lazy"
        className="size-full object-cover"
      />
    )
  }

  if (asset.kind === 'image') {
    return (
      <img
        src={assetUrl(asset.id)}
        alt={asset.name}
        loading="lazy"
        className="size-full object-contain"
      />
    )
  }

  return (
    <div className="flex size-full items-center justify-center bg-muted/30 text-muted-foreground">
      <Film className="size-10" />
    </div>
  )
}

export function AssetsPage() {
  const { t, i18n } = useTranslation()
  const { user, has } = useAuth()
  const queryClient = useQueryClient()

  usePageTitle(t('assets.title'))

  const canUpload = user !== null && (user.roles.includes('admin') || has('assets.upload'))

  const [kind, setKind] = useState<'all' | AssetKind>('all')
  const [query, setQuery] = useState('')
  const [submitted, setSubmitted] = useState('')
  const [page, setPage] = useState(1)
  const [queue, setQueue] = useState<UploadItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const listQuery = useQuery({
    queryKey: ['assets', { kind, q: submitted, page }],
    queryFn: () =>
      assetsApi.list({
        ...(kind !== 'all' ? { kind } : {}),
        ...(submitted !== '' ? { q: submitted } : {}),
        page,
        per_page: PER_PAGE,
      }),
  })

  const remove = useMutation({
    mutationFn: (id: number) => assetsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })

  const setPublic = useMutation({
    mutationFn: ({ id, is_public }: { id: number; is_public: boolean }) =>
      assetsApi.update(id, { is_public }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
    },
  })

  function addFiles(files: FileList | File[]) {
    const next: UploadItem[] = []
    for (const file of Array.from(files)) {
      const supported = file.type.startsWith('image/') || file.type.startsWith('video/')
      next.push({
        key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
        file,
        status: supported ? 'queued' : 'error',
        error: supported ? undefined : t('assets.unsupported'),
      })
    }
    setQueue((current) => [...current, ...next])
  }

  async function uploadOne(item: UploadItem) {
    setQueue((current) =>
      current.map((entry) =>
        entry.key === item.key ? { ...entry, status: 'processing' as const } : entry,
      ),
    )

    try {
      const isVideo = item.file.type.startsWith('video/')
      const formData = new FormData()
      formData.append('file', item.file)
      formData.append('name', item.file.name)
      formData.append('kind', isVideo ? 'video' : 'image')

      if (isVideo) {
        const meta = await makeVideoThumb(item.file)
        if (meta.thumb !== null) {
          formData.append('thumb', meta.thumb, 'thumb.webp')
        }
        if (meta.width > 0) {
          formData.append('width', String(meta.width))
        }
        if (meta.height > 0) {
          formData.append('height', String(meta.height))
        }
        if (meta.duration > 0) {
          formData.append('duration', String(meta.duration))
        }
      } else {
        const meta = await makeImageThumb(item.file)
        if (meta.thumb !== null) {
          formData.append('thumb', meta.thumb, 'thumb.webp')
        }
        if (meta.width > 0) {
          formData.append('width', String(meta.width))
        }
        if (meta.height > 0) {
          formData.append('height', String(meta.height))
        }
      }

      const result = await assetsApi.create(formData)

      setQueue((current) =>
        current.map((entry) =>
          entry.key === item.key
            ? {
                ...entry,
                status: 'done' as const,
                duplicate: result.duplicate,
              }
            : entry,
        ),
      )

      queryClient.invalidateQueries({ queryKey: ['assets'] })
    } catch (err) {
      const reason =
        err instanceof ApiError
          ? err.data.error ?? err.data.reason ?? t('assets.uploadError')
          : t('assets.uploadError')

      setQueue((current) =>
        current.map((entry) =>
          entry.key === item.key ? { ...entry, status: 'error' as const, error: reason } : entry,
        ),
      )
    }
  }

  async function startUpload() {
    const pending = queue.filter((entry) => entry.status === 'queued')
    for (const item of pending) {
      await uploadOne(item)
    }
  }

  async function copyLink(asset: Asset) {
    try {
      await navigator.clipboard.writeText(assetMarkdownLink(asset.name, asset.id, asset.kind))
      setCopiedId(asset.id)
      window.setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setCopiedId(-1)
    }
  }

  function handleDelete(asset: Asset) {
    if (window.confirm(t('assets.deleteConfirm'))) {
      remove.mutate(asset.id)
    }
  }

  const pendingCount = queue.filter((entry) => entry.status === 'queued').length
  const busy = queue.some((entry) => entry.status === 'processing')

  const items = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PER_PAGE))

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight">{t('assets.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('assets.description')}</p>
        </div>
        <Badge variant="outline">
          {t('assets.total', { count: total })}
        </Badge>
      </header>

      {canUpload && (
        <Card>
          <CardHeader>
            <CardAction>
              <Upload className="size-5 text-muted-foreground" />
            </CardAction>
            <CardTitle>{t('assets.uploadTitle')}</CardTitle>
            <CardDescription>{t('assets.uploadDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  inputRef.current?.click()
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragOver(false)
                if (event.dataTransfer.files.length > 0) {
                  addFiles(event.dataTransfer.files)
                }
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors',
                dragOver
                  ? 'border-primary bg-primary/5'
                  : 'border-border/70 hover:border-primary/50 hover:bg-muted/40',
              )}
            >
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">{t('assets.dropHere')}</p>
              <p className="text-xs text-muted-foreground">{t('assets.uploadHint')}</p>
            </div>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                if (event.target.files !== null) {
                  addFiles(event.target.files)
                }
                event.target.value = ''
              }}
            />

            {queue.length > 0 && (
              <ul className="space-y-1.5">
                {queue.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm"
                  >
                    {item.status === 'processing' ? (
                      <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                    ) : item.status === 'done' ? (
                      <Check className="size-4 shrink-0 text-emerald-600" />
                    ) : item.status === 'error' ? (
                      <X className="size-4 shrink-0 text-destructive" />
                    ) : (
                      <Upload className="size-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{item.file.name}</span>
                    {item.duplicate && (
                      <Badge variant="secondary">{t('assets.duplicate')}</Badge>
                    )}
                    {item.error !== undefined && (
                      <span className="truncate text-xs text-destructive">{item.error}</span>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('assets.remove')}
                      onClick={() =>
                        setQueue((current) =>
                          current.filter((entry) => entry.key !== item.key),
                        )
                      }
                      disabled={item.status === 'processing'}
                    >
                      <X />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {queue.length > 0 && (
              <Button onClick={startUpload} disabled={pendingCount === 0 || busy}>
                {busy && <Loader2 className="animate-spin" />}
                {busy ? t('assets.uploading') : t('assets.upload')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={kind}
          onValueChange={(value) => {
            setKind(value as 'all' | AssetKind)
            setPage(1)
          }}
        >
          <TabsList>
            <TabsTrigger value="all">{t('assets.filterAll')}</TabsTrigger>
            <TabsTrigger value="image">{t('assets.filterImages')}</TabsTrigger>
            <TabsTrigger value="video">{t('assets.filterVideos')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <form
          className="relative min-w-0 flex-1"
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(query.trim())
            setPage(1)
          }}
        >
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('assets.search')}
            className="pl-8"
          />
        </form>
      </div>

      {listQuery.isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {submitted !== '' ? t('assets.searchEmpty', { q: submitted }) : t('assets.empty')}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((asset) => (
              <div key={asset.id} className="glass-control flex flex-col overflow-hidden rounded-xl">
                <div className="aspect-[4/3] bg-muted/30">
                  <AssetThumb asset={asset} />
                </div>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  <p className="truncate text-sm font-medium" title={asset.name}>
                    {asset.name}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    <Badge variant="secondary">
                      {asset.kind === 'image' ? t('assets.image') : t('assets.video')}
                    </Badge>
                    <Badge variant="outline">{formatBytes(asset.size_bytes)}</Badge>
                    {asset.width !== null && asset.height !== null && (
                      <Badge variant="outline">
                        {asset.width}×{asset.height}
                      </Badge>
                    )}
                    {asset.duration !== null && (
                      <Badge variant="outline">{asset.duration.toFixed(1)}s</Badge>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span className="truncate">
                      {formatDate(asset.created_at, i18n.language)}
                      {' · '}
                      {t('assets.by', { name: asset.uploaded_by_name || '—' })}
                    </span>
                    <Switch
                      checked={asset.is_public}
                      disabled={setPublic.isPending}
                      onCheckedChange={(value) =>
                        setPublic.mutate({ id: asset.id, is_public: value })
                      }
                      aria-label={
                        asset.is_public ? t('assets.private') : t('assets.public')
                      }
                      title={asset.is_public ? t('assets.public') : t('assets.private')}
                    />
                  </div>
                  <div className="mt-auto flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="flex-1 justify-start"
                      onClick={() => copyLink(asset)}
                    >
                      {copiedId === asset.id ? (
                        <Check className="text-emerald-600" />
                      ) : (
                        <Copy />
                      )}
                      {copiedId === asset.id ? t('assets.copied') : t('assets.copyMarkdown')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive"
                      aria-label={t('assets.delete')}
                      onClick={() => handleDelete(asset)}
                      disabled={remove.isPending}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t('assets.prev')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('assets.page', { page, pages })}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= pages}
                onClick={() => setPage((value) => value + 1)}
              >
                {t('assets.next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
