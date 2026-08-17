import { memo, useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { copyText } from '@/lib/api';
import { parseFrontMatter } from '@/lib/front-matter';
import { log, error as logError } from '@/lib/logger';
import { useTheme } from '@/lib/theme';
import { type MermaidTheme, setMermaidTheme } from './mermaid';
import { postProcessHtml } from './postprocess';
import { markdownToHtml } from './render';

export interface MarkdownViewProps {
  content: string;
  className?: string;
  containerRef?: React.Ref<HTMLDivElement>;
}

export const MarkdownView = memo(function MarkdownView({
  content,
  className,
  containerRef,
}: MarkdownViewProps) {
  const { theme } = useTheme();
  const [html, setHtml] = useState('');

  const resolved: MermaidTheme =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : theme;

  useEffect(() => {
    setMermaidTheme(resolved);
  }, [resolved]);

  useEffect(() => {
    let cancelled = false;
    const body = parseFrontMatter(content).content;

    log('[MD VIEW] calling markdownToHtml, bodyLen=%d', body.length);

    markdownToHtml(body)
      .then(postProcessHtml)
      .then(next => {
        if (!cancelled) {
          log('[MD VIEW] HTML ready, len=%d', next.length);
          setHtml(next);
        }
      })
      .catch((err) => {
        logError('[MD VIEW] markdownToHtml FAILED', err);
        if (!cancelled) {
          setHtml('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [content, resolved]);

  const onCopyClick = async (event: MouseEvent<HTMLDivElement>): Promise<void> => {
    const target = event.target as HTMLElement;

    if (!target.classList.contains('md-copy')) {
      return;
    }

    const shell = target.closest('.md-codeblock');
    const code = shell?.querySelector('pre');
    if (code != null) {
      await copyText(code.textContent ?? '');
    }
  };

  return (
    <div
      ref={containerRef}
      className={className}
      onClick={onCopyClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});
