import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { externalGlobals } from '../build/vite-external-globals';

export default defineConfig(({ mode }) => ({
  plugins: [
    TanStackRouterVite({ quoteStyle: 'single' }),
    react(),
    tailwindcss(),
    externalGlobals(),
  ],
  base: './',
  define: {
    'process.env.NODE_ENV': JSON.stringify(mode === 'dev' ? 'development' : 'production'),
  },
  build: {
    sourcemap: mode === 'dev' ? true : false,
    minify: mode === 'dev' ? false : 'esbuild',
    rolldownOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}));
