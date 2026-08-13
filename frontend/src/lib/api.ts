export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE'

export interface ApiErrorData {
  error?: string
  errors?: Record<string, string[]>
  reason?: string
}

export class ApiError extends Error {
  readonly status: number
  readonly data: ApiErrorData

  constructor(status: number, data: ApiErrorData) {
    super(data.error ?? `API error ${status}`)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }
}

export function apiUrl(
  module: string,
  action: string,
  params: Record<string, string> = {},
): string {
  const query = new URLSearchParams({ module, action, ...params })
  return `${window.location.pathname}?${query.toString()}`
}

interface RequestInitOptions {
  method?: ApiMethod
  body?: unknown
  params?: Record<string, string>
}

/**
 * Perform a JSON request against the single-file backend. Non-2xx
 * responses throw an ApiError carrying the parsed `{error, errors}` body.
 */
export async function moduleRequest<T>(
  module: string,
  action: string,
  options: RequestInitOptions = {},
): Promise<T> {
  const { method = 'GET', body, params } = options

  const response = await fetch(apiUrl(module, action, params), {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (data ?? {}) as ApiErrorData,
    )
  }

  return data as T
}

export async function apiRequest<T>(
  action: string,
  options: RequestInitOptions = {},
): Promise<T> {
  return moduleRequest<T>('api', action, options)
}

/**
 * Perform a multipart upload against the backend. Unlike moduleRequest,
 * the body is a FormData (no JSON Content-Type) so files stream through
 * PHP's temp-file machinery.
 */
export async function uploadRequest<T>(
  module: string,
  action: string,
  formData: FormData,
): Promise<T> {
  const response = await fetch(apiUrl(module, action), {
    method: 'POST',
    body: formData,
  })

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (data ?? {}) as ApiErrorData,
    )
  }

  return data as T
}

/**
 * Absolute URL for an asset blob (or its thumbnail). Relative URLs in
 * asset payloads are combined with the current mount path so the single
 * file works at any depth.
 */
export function assetUrl(id: number, thumb = false): string {
  const params = new URLSearchParams({ module: 'asset', id: String(id) })
  if (thumb) {
    params.set('thumb', '1')
  }
  return `${window.location.pathname}?${params.toString()}`
}

export function assetMarkdownLink(name: string, id: number, kind: string): string {
  const url = assetUrl(id)
  return kind === 'image' ? `![${name}](${url})` : `[${name}](${url})`
}

export async function migrationRequest<T>(
  action: string,
  options: RequestInitOptions = {},
): Promise<T> {
  return moduleRequest<T>('migration', action, options)
}
