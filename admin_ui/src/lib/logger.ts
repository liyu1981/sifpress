/**
 * Debug logger controlled by `window._DEV` and persisted in
 * localStorage under the key `sifpress.dev`.
 *
 * On first load the flag defaults to `true` when served from
 * localhost (the dev server). Call `enable()` / `disable()` to
 * toggle — the choice is persisted automatically.
 *
 *   import * as log from '@/lib/logger';
 *   log.info('something', 42);
 */

const STORAGE_KEY = 'sifpress.dev';

declare global {
  interface Window {
    _DEV?: boolean;
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    plausible?: (...args: unknown[]) => void;
  }
}

function isDevServer(): boolean {
  try {
    return window.location.hostname === 'localhost';
  } catch {
    return false;
  }
}

/**
 * Call once at application start (before any other import) to
 * initialise the flag from localStorage (defaulting to `true` on
 * the dev server).
 */
export function initLogger(): void {
  const stored = localStorage.getItem(STORAGE_KEY);

  if (stored === null) {
    window._DEV = isDevServer();
  } else {
    window._DEV = stored === 'true';
  }
}

export function enable(): void {
  window._DEV = true;
  localStorage.setItem(STORAGE_KEY, 'true');
}

export function disable(): void {
  window._DEV = false;
  localStorage.setItem(STORAGE_KEY, 'false');
}

export function isEnabled(): boolean {
  return window._DEV === true;
}

export function log(...args: unknown[]): void {
  if (window._DEV === true) console.log(...args);
}

export function warn(...args: unknown[]): void {
  if (window._DEV === true) console.warn(...args);
}

export function error(...args: unknown[]): void {
  if (window._DEV === true) console.error(...args);
}
