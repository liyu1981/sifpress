import { appBaseUrl, prettyUrls } from './base-url';

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

/**
 * URL for a backend module route, in whichever URL mode the artifact is
 * serving (see base-url.ts / src/urlmode.php):
 *
 *   query mode   /index.php?p=sifpress/api&action=…   (document-relative)
 *   clean paths  /sifpress/api?action=…                (mount-aware)
 *
 * Every caller goes through here, so both forms stay in lockstep.
 */
export function moduleUrl(module: string, params: Record<string, string> = {}): string {
  if (prettyUrls()) {
    const query = new URLSearchParams(params).toString();
    const base = appBaseUrl().replace(/\/+$/, '');
    return `${base}/${module}${query === '' ? '' : `?${query}`}`;
  }

  return `${appBaseUrl()}?${new URLSearchParams({ p: module, ...params }).toString()}`;
}

export function apiUrl(
  module: string,
  action: string,
  params: Record<string, string> = {},
): string {
  return moduleUrl(module, { action, ...params });
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
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(apiUrl(module, action, params), {
    method: 'POST',
    body: formData,
    ...(signal !== undefined ? { signal } : {}),
  });

  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, (data ?? {}) as ApiErrorData);
  }

  return data as T;
}

/**
 * Absolute URL for an asset blob (or its thumbnail). Root-relative URLs carry
 * the artifact's mount path, so the single file works at any depth and under
 * either URL mode.
 */
export function assetUrl(id: number, thumb = false): string {
  return moduleUrl('sifpress/asset', thumb ? { id: String(id), thumb: '1' } : { id: String(id) });
}

/**
 * URL for a user's avatar. The backend serves the stored image when present,
 * otherwise a generated SVG, so this endpoint always returns an image.
 */
export function avatarUrl(userId: number): string {
  return moduleUrl('sifpress/asset', { user: String(userId) });
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
  if (kind !== 'video') {
    return assetUrl(id);
  }

  const ext = /\.([a-z0-9]{2,5})$/i.exec(name)?.[1]?.toLowerCase() ?? 'mp4';
  return moduleUrl('sifpress/asset', { id: String(id), filetype: ext });
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
