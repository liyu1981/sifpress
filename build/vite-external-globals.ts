import type { Plugin } from 'vite';

/**
 * Map of shared-library specifier -> runtime global on window.SifpressUI.
 * The shared bundle (ui-sdk.mjs) bundles one copy of each of these and
 * exposes them as namespaces; consumer apps rewrite their imports to read
 * from those globals so only a single instance is ever loaded.
 */
const MILKDOWN_PREFIXES = [
  'crepe/builder',
  'crepe/feature/block-edit',
  'crepe/feature/code-mirror',
  'crepe/feature/cursor',
  'crepe/feature/latex',
  'crepe/feature/link-tooltip',
  'crepe/feature/list-item',
  'crepe/feature/placeholder',
  'crepe/feature/table',
  'crepe/feature/toolbar',
  'kit/core',
  'kit/ctx',
  'kit/plugin/tooltip',
  'kit/preset/commonmark',
  'kit/prose/inputrules',
  'kit/prose/model',
  'kit/prose/state',
  'kit/prose/view',
  'kit/utils',
];

const SHARED_EXTERNALS: Array<{ id: string; global: string }> = [
  { id: 'react', global: 'window.SifpressUI.React' },
  { id: 'react/jsx-runtime', global: 'window.SifpressUI.ReactJSXRuntime' },
  { id: 'react/jsx-dev-runtime', global: 'window.SifpressUI.ReactJSXRuntime' },
  { id: 'react-dom', global: 'window.SifpressUI.ReactDOM' },
  { id: 'react-dom/client', global: 'window.SifpressUI.ReactDOMClient' },
  { id: '@tanstack/react-query', global: 'window.SifpressUI.ReactQuery' },
  { id: '@tanstack/react-router', global: 'window.SifpressUI.ReactRouter' },
  { id: 'react-i18next', global: 'window.SifpressUI.ReactI18next' },
  { id: 'i18next', global: 'window.SifpressUI.i18next' },
  { id: 'ui-sdk', global: 'window.SifpressUI.sdk' },
  ...MILKDOWN_PREFIXES.map(prefix => ({
    id: `@milkdown/${prefix}`,
    global: `window.SifpressUI.Milkdown['${prefix}']`,
  })),
];

const EXTERNALS = new Map(SHARED_EXTERNALS.map(e => [e.id, e.global]));

/**
 * Rewrite `import { a, b as c } from 'react'` -> `const { a, b: c } =
 * window.SifpressUI.React;` and `import * as R from 'react'` ->
 * `const R = window.SifpressUI.React;`. Runs after esbuild has stripped
 * type-only imports, so only runtime imports remain.
 */
export function rewriteImports(code: string): string {
  let out = code;
  let lastIndex = 0;

  const importRe =
    /import\s+(?:(?<star>\*\s+as\s+\w+)|(?:\{(?<named>[^}]*)\})|(?<def>\w+))(?:\s*,\s*(?:(?<star2>\*\s+as\s+\w+)|(?:\{(?<named2>[^}]*)\})))?\s+from\s+['"](?<from>[^'"]+)['"];?/g;

  const replacements: Array<{ index: number; length: number; text: string }> = [];

  for (const match of code.matchAll(importRe)) {
    const specifier = match.groups?.from;
    const global = specifier === undefined ? undefined : EXTERNALS.get(specifier);

    if (global === undefined) {
      continue;
    }

    const parts: string[] = [];
    const id = match.index ?? 0;

    if (match.groups?.def) {
      parts.push(`${match.groups.def} = ${global}.default`);
    }

    if (match.groups?.star) {
      const name = match.groups.star.replace(/\*\s+as\s+/, '');
      parts.push(`${name} = ${global}`);
    }

    const named = match.groups?.named ?? match.groups?.named2;

    if (named !== undefined && named.trim() !== '') {
      // `x as y` in an import is `x: y` in destructuring.
      const destructured = named
        .split(',')
        .map(part => part.trim().replace(/\s+as\s+/g, ': '))
        .join(', ');
      parts.push(`{ ${destructured} } = ${global}`);
    }

    if (match.groups?.star2) {
      const name = match.groups.star2.replace(/\*\s+as\s+/, '');
      parts.push(`${name} = ${global}`);
    }

    if (parts.length === 0) {
      // side-effect-only import; drop it (module already loaded by the tag)
      replacements.push({ index: id, length: match[0].length, text: '' });
      continue;
    }

    replacements.push({
      index: id,
      length: match[0].length,
      text: `const ${parts.join(', ')};`,
    });
  }

  // Apply from the end so indices stay valid.
  for (let i = replacements.length - 1; i >= 0; i--) {
    const { index, length, text } = replacements[i];
    out = out.slice(0, index) + text + out.slice(index + length);
  }

  void lastIndex;

  return out;
}

/**
 * Vite plugin that externalizes the shared libraries and rewrites their
 * imports to read from window.SifpressUI (provided by ui-sdk.mjs). Consumer
 * apps (admin + sifront) use this so React and the common libs are loaded
 * once from the shared bundle instead of being bundled into each app.
 */
export function externalGlobals(): Plugin {
  return {
    name: 'sifpress-external-globals',
    enforce: 'post',
    resolveId(id) {
      if (EXTERNALS.has(id)) {
        return { id, external: true };
      }
      return null;
    },
    transform(code) {
      return { code: rewriteImports(code), map: null };
    },
  };
}