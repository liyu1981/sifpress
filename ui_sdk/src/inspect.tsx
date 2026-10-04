import { useEffect, useRef } from 'react';

/**
 * KV inspect mode for sifronts.
 *
 * Load a sifront with `?inspect=1` (any value except an empty one, `0`,
 * `false`, `off` or `no`) and every element whose content comes from a KV key
 * is outlined, with the key printed on the label:
 *
 *   <p {...kvAttrs('sifpress1.footer.text')}>{footerText}</p>
 *     renders as  ┌ sifpress1.footer.text ┐
 *                 │ Powered by Sifpress   │
 *                 └────────────────────────┘
 *
 * Keys with no stored value — the sifront is showing its built-in default — are
 * drawn dashed and amber, so an unconfigured section or a key that never gets
 * read is obvious at a glance. The whole thing is one fixed, transparent
 * layer with `pointer-events: none`, so nothing in the page's own layout
 * moves and the markup stays inspectable by CSS via
 * `html[data-sifront-inspect="on"]`.
 */

/** Query parameter that turns the overlay on. */
export const INSPECT_PARAM = 'inspect';

/** Attribute carrying the KV key on an annotated element. */
export const KV_ATTR = 'data-sifront-kv';

const LAYER_ID = 'sifront-inspect-layer';

/** Values that count as "off", so `?inspect=0` is a usable kill switch. */
const OFF_VALUES = new Set(['', '0', 'false', 'off', 'no']);

/** Label height in px: the box draws the label above itself when there is room. */
const LABEL_HEIGHT = 16;

const RED = '#ef4444';
const AMBER = '#d97706';

export interface KvAttrs {
  'data-sifront-kv': string;
}

/** Spread onto the element a KV key drives: `<p {...kvAttrs(key)}>`. */
export function kvAttrs(key: string): KvAttrs {
  return { [KV_ATTR]: key };
}

/** True when the given query string asks for inspect mode. */
export function isInspectOn(search: string): boolean {
  const value = new URLSearchParams(search).get(INSPECT_PARAM);

  return value !== null && !OFF_VALUES.has(value.toLowerCase());
}

/**
 * Append (or replace) the inspect parameter on a URL, e.g. for a preview link.
 * The existing query string is kept verbatim rather than re-serialized, so
 * values like `?p=sifpress/admin` do not come back percent-encoded.
 */
export function withInspect(url: string, value = '1'): string {
  const hashAt = url.indexOf('#');
  const hash = hashAt >= 0 ? url.slice(hashAt) : '';
  const head = hashAt >= 0 ? url.slice(0, hashAt) : url;
  const queryAt = head.indexOf('?');
  const query = queryAt >= 0 ? head.slice(queryAt + 1) : '';

  if (new RegExp(`(?:^|&)${INSPECT_PARAM}=`).test(query)) {
    return url;
  }

  /* A bare trailing `?` carries no query, so replace it instead of adding to it. */
  const base = query === '' && queryAt >= 0 ? head.slice(0, queryAt) : head;

  return `${base}${query === '' ? '?' : '&'}${INSPECT_PARAM}=${encodeURIComponent(value)}${hash}`;
}

/**
 * Resolve a (possibly nested) key against the stored KV map: `sifpress2.copy`
 * is one KV holding a map of strings, so `sifpress2.copy.viewAll` has to look
 * inside the parent value.
 */
function lookupValue(values: Record<string, unknown> | undefined, key: string): unknown {
  if (values === undefined) {
    return undefined;
  }

  const direct = values[key];

  if (direct !== undefined) {
    return direct;
  }

  const dot = key.lastIndexOf('.');

  if (dot < 0) {
    return undefined;
  }

  const parent = lookupValue(values, key.slice(0, dot));

  if (parent !== null && typeof parent === 'object') {
    return (parent as Record<string, unknown>)[key.slice(dot + 1)];
  }

  return undefined;
}

export interface KvInspectorOptions {
  /** Current stored KV values; read on every scan, so pass the live map. */
  values: () => Record<string, unknown> | undefined;
  /** Keys the sifront declares in `meta.json` -> `require_keys`. */
  declaredKeys: () => string[];
}

export interface KvInspector {
  /** Stop the loop and remove the overlay layer. */
  destroy: () => void;
}

interface Target {
  el: Element;
  key: string;
}

interface Box {
  frame: HTMLDivElement;
  label: HTMLSpanElement;
  /** Cached `key|mode|placement`, so we only touch the DOM when it changes. */
  state: string;
}

/**
 * Start the inspector: it owns its own animation loop and DOM layer and cleans
 * up after itself. Values and declared keys are read through callbacks, so a
 * KV refetch only repaints the boxes instead of restarting anything.
 */
export function createKvInspector(options: KvInspectorOptions): KvInspector {
  const root = document.documentElement;

  let enabled = isInspectOn(window.location.search);
  let lastSearch = window.location.search;
  let raf = 0;
  let layer: HTMLDivElement | null = null;
  let boxes: Box[] = [];
  let legend: HTMLDivElement | null = null;
  let legendState = '';

  root.dataset.sifrontInspect = enabled ? 'on' : 'off';

  const makeLabel = (): HTMLSpanElement => {
    const label = document.createElement('span');

    label.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'max-width:min(60vw,460px)',
      'overflow:hidden',
      'text-overflow:ellipsis',
      'white-space:nowrap',
      'padding:0 4px',
      'border-radius:2px',
      'color:#fff',
      'font:10px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    ].join(';');

    return label;
  };

  const makeBox = (): Box => {
    const frame = document.createElement('div');
    const label = makeLabel();

    frame.style.cssText = [
      'position:absolute',
      'left:0',
      'top:0',
      'box-sizing:border-box',
      'border-radius:2px',
      'pointer-events:none',
      'will-change:transform',
    ].join(';');
    frame.appendChild(label);

    return { frame, label, state: '' };
  };

  const makeLegend = (): HTMLDivElement => {
    const chip = document.createElement('div');

    chip.style.cssText = [
      'position:fixed',
      'left:8px',
      'bottom:8px',
      `background:${RED}`,
      'color:#fff',
      'padding:3px 8px',
      'border-radius:4px',
      'box-shadow:0 1px 4px rgb(0 0 0 / 35%)',
      'font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
    ].join(';');

    return chip;
  };

  const ensureLayer = (): void => {
    if (layer !== null) {
      return;
    }

    layer = document.createElement('div');
    layer.id = LAYER_ID;
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:2147483647',
      'pointer-events:none',
    ].join(';');
    legend = makeLegend();
    layer.appendChild(legend);
    document.body.appendChild(layer);
  };

  const destroyLayer = (): void => {
    layer?.remove();
    layer = null;
    boxes = [];
    legend = null;
    legendState = '';
  };

  const scan = (): Target[] => {
    const out: Target[] = [];

    for (const el of Array.from(document.querySelectorAll(`[${KV_ATTR}]`))) {
      const key = el.getAttribute(KV_ATTR);

      if (key !== null && key !== '') {
        out.push({ el, key });
      }
    }

    return out;
  };

  const drawBox = (box: Box, target: Target): boolean => {
    const rect = target.el.getBoundingClientRect();

    if (rect.width === 0 || rect.height === 0) {
      box.frame.style.display = 'none';

      return false;
    }

    const stored = lookupValue(options.values(), target.key) !== undefined;
    const above = rect.top > LABEL_HEIGHT + 2;
    const state = `${target.key}|${stored ? 'set' : 'default'}|${above ? 'above' : 'inside'}`;

    if (state !== box.state) {
      const color = stored ? RED : AMBER;

      box.state = state;
      box.frame.style.border = `1px ${stored ? 'solid' : 'dashed'} ${color}`;
      box.label.style.background = color;
      box.label.textContent = stored ? target.key : `${target.key} · default`;
      box.label.style.transform = above ? 'translateY(-100%)' : 'none';
    }

    box.frame.style.display = 'block';
    box.frame.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
    box.frame.style.width = `${rect.width}px`;
    box.frame.style.height = `${rect.height}px`;

    return stored;
  };

  const drawLegend = (shown: string[], setCount: number): void => {
    if (legend === null) {
      return;
    }

    const declared = options.declaredKeys();
    const visible = new Set(shown);
    const missing = declared.filter(key => !visible.has(key));
    const text =
      `inspect · ${shown.length} shown · ${setCount} set` +
      (declared.length > 0 ? ` of ${declared.length} declared` : '');
    const state = `${text}|${missing.join(',')}`;

    if (state === legendState) {
      return;
    }

    legendState = state;
    legend.textContent = text;
    legend.title =
      missing.length === 0
        ? 'Remove ?inspect from the URL to exit.'
        : `${missing.length} declared key(s) not rendered on this page:\n${missing.join('\n')}`;
  };

  /*
   * One rAF loop drives everything: it re-reads the query string (so the
   * overlay follows SPA navigation and can be turned off with the URL), and
   * re-measures the annotated elements every frame so the boxes track scroll,
   * layout shifts, lazy images and theme flips without observers. The
   * element count is tiny, and per-box DOM writes are guarded by a state
   * string, so a frame that changes nothing touches almost nothing.
   */
  const frame = (): void => {
    raf = requestAnimationFrame(frame);

    const search = window.location.search;

    if (search !== lastSearch) {
      lastSearch = search;

      const next = isInspectOn(search);

      if (next !== enabled) {
        enabled = next;
        root.dataset.sifrontInspect = enabled ? 'on' : 'off';

        if (!enabled) {
          destroyLayer();

          return;
        }
      }
    }

    if (!enabled) {
      return;
    }

    ensureLayer();

    const targets = scan();

    while (boxes.length < targets.length) {
      const box = makeBox();
      boxes.push(box);
      layer?.appendChild(box.frame);
    }

    let setCount = 0;
    const shown: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      shown.push(targets[i].key);

      if (drawBox(boxes[i], targets[i])) {
        setCount++;
      }
    }

    for (let i = targets.length; i < boxes.length; i++) {
      boxes[i].frame.style.display = 'none';
    }

    drawLegend(shown, setCount);
  };

  raf = requestAnimationFrame(frame);

  return {
    destroy() {
      cancelAnimationFrame(raf);
      destroyLayer();
      delete root.dataset.sifrontInspect;
    },
  };
}

export interface InspectOverlayProps {
  /** Stored KV values (the `kvsApi.getMany` response map). */
  values?: Record<string, unknown>;
  /** Keys the sifront declares in `meta.json` -> `require_keys`. */
  declaredKeys?: string[];
}

/**
 * Mounts the inspector for the lifetime of the app. It renders nothing at all
 * unless inspect mode is on, so mounting it unconditionally costs one
 * `useEffect`.
 */
export function InspectOverlay({ values, declaredKeys }: InspectOverlayProps) {
  const valuesRef = useRef(values);
  const declaredRef = useRef(declaredKeys);

  valuesRef.current = values;
  declaredRef.current = declaredKeys;

  useEffect(() => {
    const inspector = createKvInspector({
      values: () => valuesRef.current,
      declaredKeys: () => declaredRef.current ?? [],
    });

    return () => inspector.destroy();
  }, []);

  return null;
}
