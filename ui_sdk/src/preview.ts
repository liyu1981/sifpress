import { parseFrontMatter } from './front-matter';
import { type Page, type PageSeo, type PageStatus } from './pages';

/**
 * Unsaved-buffer preview handoff.
 *
 * The editor parks its current (possibly never-saved) buffer in
 * `sessionStorage` and opens the sifront with `?preview=1`; the sifront's
 * article route reads it back and renders it instead of fetching the page, so
 * a preview always shows exactly what is on the editor's screen — including a
 * brand-new article that has no row yet.
 *
 * Same-origin only: the buffer never leaves the browser, and a normal visit to
 * `/article/<slug>` (no `preview` param) never picks one up. Entries expire
 * after PREVIEW_TTL_MS so a forgotten tab cannot show stale text forever.
 */

export const PREVIEW_PARAM = 'preview';

const PREVIEW_PREFIX = 'sifpress.preview.';
const PREVIEW_TTL_MS = 15 * 60_000;
const PREVIEW_VERSION = 1;

export interface PreviewBuffer {
  v: number;
  ts: number;
  slug: string;
  /** Editor route for the round trip: the *saved* slug, or 'new'. */
  edit_slug: string;
  title: string;
  content_md: string;
  status: PageStatus;
  created_at: string;
  updated_at: string;
  created_by_name: string;
}

export type PreviewDraft = Omit<PreviewBuffer, 'v' | 'ts'>;

/** Park the buffer for the tab about to be opened. False in private mode / on quota. */
export function writePreviewBuffer(draft: PreviewDraft): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    window.sessionStorage.setItem(
      `${PREVIEW_PREFIX}${draft.slug}`,
      JSON.stringify({ v: PREVIEW_VERSION, ts: Date.now(), ...draft }),
    );

    return true;
  } catch {
    return false;
  }
}

/** Whether this document was opened as a preview (`?preview=1`, any truthy value). */
export function isPreviewRequest(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  const value = new URLSearchParams(window.location.search).get(PREVIEW_PARAM);

  return value !== null && value !== '' && value !== '0' && value !== 'false' && value !== 'off';
}

/**
 * The parked buffer for `slug`, or null: never outside a preview request,
 * never past its TTL, never when the shape does not check out. Expired or
 * malformed entries are dropped so they cannot linger.
 */
export function readPreviewBuffer(slug: string): PreviewBuffer | null {
  if (!isPreviewRequest() || typeof window === 'undefined') {
    return null;
  }

  const key = `${PREVIEW_PREFIX}${slug}`;

  try {
    const raw = window.sessionStorage.getItem(key);

    if (raw === null) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PreviewBuffer>;
    const valid =
      parsed.v === PREVIEW_VERSION &&
      typeof parsed.ts === 'number' &&
      parsed.slug === slug &&
      typeof parsed.edit_slug === 'string' &&
      typeof parsed.title === 'string' &&
      typeof parsed.content_md === 'string';

    if (!valid) {
      window.sessionStorage.removeItem(key);

      return null;
    }

    const buffer = parsed as PreviewBuffer;

    if (Date.now() - buffer.ts > PREVIEW_TTL_MS) {
      window.sessionStorage.removeItem(key);

      return null;
    }

    return buffer;
  } catch {
    return null;
  }
}

/**
 * Shape the buffer like an API page, so the sifront article routes render it
 * unchanged. `seo.noindex` is forced on: a preview must never be indexed,
 * including a preview of an already-published page (whose URL the client-side
 * head sync would otherwise leave indexable).
 */
export function previewToPage(buffer: PreviewBuffer): Page {
  const { data } = parseFrontMatter(buffer.content_md);
  const tags = Array.isArray(data.tags) ? data.tags.map((tag: unknown) => String(tag)) : [];
  const seo: PageSeo = {
    title: buffer.title,
    description: '',
    og_image: '',
    canonical: '',
    noindex: true,
    keywords: '',
  };

  return {
    id: -1,
    slug: buffer.slug,
    title: buffer.title,
    content_md: buffer.content_md,
    tags,
    status: buffer.status,
    hide_from_search: false,
    current_revision_id: null,
    created_by: null,
    created_by_name: buffer.created_by_name,
    updated_by: null,
    updated_by_name: buffer.created_by_name,
    created_at: buffer.created_at,
    updated_at: buffer.updated_at,
    can_edit: true,
    seo,
  };
}
