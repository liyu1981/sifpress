import { appBaseUrl } from './base-url';

declare global {
  interface Window {
    SIFPRESS_UI_VERSION?: string;
  }
}

const inFlight = new Map<string, Promise<void>>();

/**
 * Read a library that a lazy chunk published onto `window.SifpressUI.Libs`.
 * Returns `null` until the chunk has executed.
 */
export function getUiLib<T>(name: string): T | null {
  const w = window as unknown as { SifpressUI?: { Libs?: Record<string, unknown> } };
  const value = w.SifpressUI?.Libs?.[name];
  return value === undefined ? null : (value as T);
}

/**
 * Load a separately built ui-sdk chunk (e.g. `ui-sdk-mermaid.mjs`) by
 * injecting a module script served from `?p=sifpress/asset/js/<file>`. The
 * single-file backend cannot serve Vite's default `/assets/*.mjs` chunk URLs,
 * so chunks are addressed through the same `?p=` scheme as the core bundle.
 *
 * `ready` short-circuits when the chunk already published its library; the
 * in-flight map dedupes concurrent callers.
 */
export function loadUiChunk(file: string, ready: () => boolean): Promise<void> {
  if (ready()) {
    return Promise.resolve();
  }

  const existing = inFlight.get(file);

  if (existing !== undefined) {
    return existing;
  }

  const version = window.SIFPRESS_UI_VERSION ?? '';
  const query = new URLSearchParams({ p: `sifpress/asset/js/${file}` });

  if (version !== '') {
    query.set('v', version);
  }

  const url = `${appBaseUrl()}?${query.toString()}`;

  const promise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module';
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => {
      inFlight.delete(file);
      reject(new Error(`Failed to load ui-sdk chunk: ${file}`));
    };
    document.head.appendChild(script);
  });

  inFlight.set(file, promise);

  return promise;
}
