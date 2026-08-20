export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface ApiErrorData {
  error?: string;
  errors?: Record<string, string[]>;
  reason?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly data: ApiErrorData;

  constructor(status: number, data: ApiErrorData) {
    super(data.error ?? `API error ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function apiUrl(
  module: string,
  action: string,
  params: Record<string, string> = {},
): string {
  const query = new URLSearchParams({ p: module, action, ...params });
  return `${window.location.pathname}?${query.toString()}`;
}

interface RequestInitOptions {
  method?: ApiMethod;
  body?: unknown;
  params?: Record<string, string>;
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
  const { method = 'GET', body, params } = options;

  const response = await fetch(apiUrl(module, action, params), {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, (data ?? {}) as ApiErrorData);
  }

  return data as T;
}

export async function apiRequest<T>(action: string, options: RequestInitOptions = {}): Promise<T> {
  return moduleRequest<T>('sifpress/api', action, options);
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
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, (data ?? {}) as ApiErrorData);
  }

  return data as T;
}

/**
 * Absolute URL for an asset blob (or its thumbnail). Relative URLs in
 * asset payloads are combined with the current mount path so the single
 * file works at any depth.
 */
export function assetUrl(id: number, thumb = false): string {
  const params = new URLSearchParams({ p: 'sifpress/asset', id: String(id) });
  if (thumb) {
    params.set('thumb', '1');
  }
  return `${window.location.pathname}?${params.toString()}`;
}

/**
 * URL for a user's avatar. The backend serves the stored image when present,
 * otherwise a generated SVG, so this endpoint always returns an image.
 */
export function avatarUrl(userId: number): string {
  const params = new URLSearchParams({ p: 'sifpress/asset', user: String(userId) });
  return `${window.location.pathname}?${params.toString()}`;
}

function escapeMarkdownText(name: string): string {
  return name.replace(/[\\[\]()]/g, ch => `\\${ch}`);
}

/**
 * URL for an asset's source. App-asset URLs carry no extension, so video
 * assets are tagged with `&filetype=<ext>` — the backend ignores the param,
 * but the renderer uses it to pick `<video>` over `<img>`.
 */
export function assetSourceUrl(id: number, name: string, kind: string): string {
  const url = assetUrl(id);
  if (kind !== 'video') {
    return url;
  }
  const ext = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ?? 'mp4';
  return `${url}&filetype=${ext}`;
}

export function assetMarkdownLink(name: string, id: number, kind: string): string {
  return `![${escapeMarkdownText(name)}](${assetSourceUrl(id, name, kind)})`;
}

/**
 * Copy text to the clipboard with a legacy fallback. navigator.clipboard
 * only exists in secure contexts (HTTPS or localhost), so serving over a
 * plain-http LAN address throws and silently fails — fall back to the
 * hidden-textarea execCommand path which works everywhere.
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

export async function migrationRequest<T>(
  action: string,
  options: RequestInitOptions = {},
): Promise<T> {
  return moduleRequest<T>('sifpress/migration', action, options);
}
