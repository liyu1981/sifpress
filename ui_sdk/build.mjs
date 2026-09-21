import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { build } from 'vite';
import { externalGlobals } from '../build/vite-external-globals.ts';

/**
 * Build the shared ui-sdk as five independent, self-contained ES modules:
 *
 *   ui-sdk.mjs            core (React, query, router, i18n, api, light markdown)
 *   ui-sdk-markdown.mjs   lazy: Milkdown/Crepe render + edit pipeline
 *   ui-sdk-mermaid.mjs    lazy: mermaid
 *   ui-sdk-katex.mjs      lazy: katex
 *   ui-sdk-highlight.mjs  lazy: highlight.js
 *
 * Each entry is built with code splitting disabled so the emitted file has no
 * relative `./chunk-*.js` imports. The single-file backend serves every file
 * through `?p=sifpress/asset/js/<name>`, where relative chunk URLs cannot
 * resolve, so self-contained files keep serving trivial.
 *
 * The core provides `window.SifpressUI` (React, libs, the ui-sdk API). The
 * chunks consume it, so they externalize React to that global — except
 * `ui-sdk-markdown`, which is the module that *provides*
 * `window.SifpressUI.Milkdown`, so it must bundle Milkdown itself.
 */
const dev = process.argv[2] === 'dev';
const root = fileURLToPath(new URL('.', import.meta.url));

const entries = {
  'ui-sdk': 'src/sifpress-ui.ts',
  'ui-sdk-markdown': 'src/chunks/markdown.ts',
  'ui-sdk-mermaid': 'src/chunks/mermaid.ts',
  'ui-sdk-katex': 'src/chunks/katex.ts',
  'ui-sdk-highlight': 'src/chunks/highlight.ts',
};

let first = true;

for (const [name, entry] of Object.entries(entries)) {
  const plugins =
    name === 'ui-sdk' ? [react()] : [react(), ...externalGlobals({ milkdown: false })];

  await build({
    root,
    configFile: false,
    mode: dev ? 'dev' : 'release',
    logLevel: 'warn',
    plugins,
    define: {
      'process.env.NODE_ENV': JSON.stringify(dev ? 'development' : 'production'),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: first,
      sourcemap: dev,
      minify: !dev,
      lib: {
        entry: fileURLToPath(new URL(entry, import.meta.url)),
        formats: ['es'],
        fileName: () => `${name}.mjs`,
      },
      rolldownOptions: {
        output: {
          codeSplitting: false,
          minify: !dev,
        },
      },
    },
  });

  first = false;
}
