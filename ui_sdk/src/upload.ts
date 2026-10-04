import { ApiError } from './api';
import { assetsApi, type Asset, type AssetCreateResult } from './pages';

/**
 * Resumable asset upload.
 *
 * The single-shot `assets.create` path is one multipart request, so its ceiling
 * is `post_max_size` (8 MB on a stock host — see asset_php_upload_limit()).
 * This slices the file into parts the server told us it can accept, sends a few
 * concurrently, retries the flaky ones, and records the upload id so an
 * interrupted transfer resumes with only the missing parts.
 *
 * Progress is computed from completed parts rather than from an upload event,
 * which `fetch` does not provide.
 */

const CONCURRENCY = 3;
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 500;
const STORE_PREFIX = 'sifpress.upload.';

/** Storage keys are short; a handful of resumable uploads is plenty. */
const MAX_TRACKED = 8;

export interface UploadProgress {
  /** Bytes confirmed by the server so far. */
  sent: number;
  total: number;
  /** Parts finished / expected. */
  parts: number;
  partsTotal: number;
}

export interface ResumableUploadOptions {
  file: File;
  /** Optional client-generated thumbnail (see assets.ts). */
  thumb?: Blob | null;
  width?: number;
  height?: number;
  duration?: number;
  signal?: AbortSignal;
  onProgress?: (progress: UploadProgress) => void;
}

function fingerprint(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

interface ResumeRecord {
  uploadId: string;
  parts: number[];
  partSize: number;
}

function readResume(key: string): ResumeRecord | null {
  try {
    const raw = window.localStorage.getItem(STORE_PREFIX + key);

    if (raw === null) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<ResumeRecord>;

    if (typeof parsed.uploadId !== 'string' || !Array.isArray(parsed.parts)) {
      return null;
    }

    return {
      uploadId: parsed.uploadId,
      parts: parsed.parts.filter((part): part is number => typeof part === 'number'),
      partSize: typeof parsed.partSize === 'number' ? parsed.partSize : 0,
    };
  } catch {
    return null;
  }
}

function writeResume(key: string, record: ResumeRecord): void {
  try {
    window.localStorage.setItem(STORE_PREFIX + key, JSON.stringify(record));

    /* Keep the store bounded: drop the oldest tracked uploads. */
    const keys = Object.keys(window.localStorage)
      .filter(name => name.startsWith(STORE_PREFIX))
      .sort();

    for (const stale of keys.slice(0, Math.max(0, keys.length - MAX_TRACKED))) {
      window.localStorage.removeItem(stale);
    }
  } catch {
    // Private mode / quota: resume is a nicety, never a requirement.
  }
}

function clearResume(key: string): void {
  try {
    window.localStorage.removeItem(STORE_PREFIX + key);
  } catch {
    // ignore
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(new DOMException('aborted', 'AbortError'));

      return;
    }

    const timer = window.setTimeout(resolve, ms);

    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Retry on network errors and 5xx; a 4xx is the server's final answer. */
function isRetryable(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return false;
  }

  if (error instanceof ApiError) {
    return error.status >= 500 || error.status === 429;
  }

  return true;
}

function partLength(file: File, part: number, partSize: number): number {
  return Math.min(partSize, file.size - part * partSize);
}

/**
 * Upload `file` in parts, resuming when a previous attempt left some behind.
 */
export async function uploadAssetResumable(
  options: ResumableUploadOptions,
): Promise<AssetCreateResult> {
  const { file, signal } = options;

  if (signal?.aborted === true) {
    throw new DOMException('aborted', 'AbortError');
  }

  const key = fingerprint(file);
  const resume = readResume(key);

  const created = await assetsApi.uploadCreate({
    name: file.name,
    size_bytes: file.size,
    mime: file.type,
    width: options.width,
    height: options.height,
    duration: options.duration,
    ...(resume !== null ? { upload_id: resume.uploadId } : {}),
  });

  const { part_size: partSize, parts_total: partsTotal } = created;
  const done = new Set<number>(created.parts);
  let partsDone = done.size;

  const report = (): void => {
    let sent = 0;

    for (const part of done) {
      sent += partLength(file, part, partSize);
    }

    options.onProgress?.({ sent, total: file.size, parts: partsDone, partsTotal });
  };

  const markDone = (part: number): void => {
    if (done.has(part)) {
      return;
    }

    done.add(part);
    partsDone = done.size;
    writeResume(key, {
      uploadId: created.upload_id,
      parts: [...done].sort((a, b) => a - b),
      partSize,
    });
    report();
  };

  report();

  const pending: number[] = [];

  for (let part = 0; part < partsTotal; part++) {
    if (!done.has(part)) {
      pending.push(part);
    }
  }

  const send = async (part: number): Promise<void> => {
    const start = part * partSize;
    const blob = file.slice(start, start + partLength(file, part, partSize));

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        await assetsApi.uploadPart(created.upload_id, part, blob, signal);
        markDone(part);

        return;
      } catch (error) {
        if (attempt === MAX_ATTEMPTS || !isRetryable(error)) {
          throw error;
        }

        /* Exponential backoff with jitter, so a struggling server is not
         * hammered by every part at once. */
        const backoff = RETRY_BASE_MS * 2 ** (attempt - 1);
        await sleep(backoff * (0.7 + Math.random() * 0.6), signal);
      }
    }
  };

  /* A fixed pool of workers pulling from the queue: keeps concurrency bounded
   * without a scheduler, and any failure rejects the whole upload. */
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, pending.length) }, async () => {
    for (;;) {
      const index = cursor;

      cursor += 1;

      if (index >= pending.length) {
        return;
      }

      await send(pending[index]);
    }
  });

  try {
    await Promise.all(workers);
  } catch (error) {
    // Keep the resume record so the next attempt only sends what is missing.
    writeResume(key, {
      uploadId: created.upload_id,
      parts: [...done].sort((a, b) => a - b),
      partSize,
    });

    throw error;
  }

  const result = await assetsApi.uploadComplete(created.upload_id, {
    thumb: options.thumb ?? null,
    signal,
  });

  clearResume(key);

  return result;
}

export type { Asset, AssetCreateResult };
