import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/lib/theme';
import { router } from './router';
import fallbackMeta from '../meta.json';
import './index.css';

function initSifrontMeta(): void {
  const tag = document.querySelector('meta[name="sifront_meta"]');
  const content = tag?.getAttribute('content');

  if (typeof content === 'string' && content !== '') {
    try {
      window._sifront_meta = JSON.parse(content) as SifrontMeta;
      return;
    } catch {
      // fall through to bundled fallback
    }
  }

  window._sifront_meta = fallbackMeta as SifrontMeta;
}

initSifrontMeta();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
