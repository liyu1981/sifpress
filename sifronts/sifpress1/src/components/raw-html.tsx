import { useEffect, useRef } from 'react';

/**
 * Renders trusted, admin-authored raw HTML. Scripts inserted through
 * `dangerouslySetInnerHTML` never run, so inline/external `<script>` tags
 * are recreated after mount to execute (e.g. a Disqus embed). The
 * `data-executed` marker keeps React StrictMode's double-effect from
 * running them twice.
 */
export function RawHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = ref.current;
    if (container === null) {
      return;
    }

    for (const original of Array.from(container.querySelectorAll('script'))) {
      if (original.dataset.executed === 'true') {
        continue;
      }

      const script = document.createElement('script');
      for (const attr of Array.from(original.attributes)) {
        script.setAttribute(attr.name, attr.value);
      }
      script.text = original.text;
      script.dataset.executed = 'true';
      original.replaceWith(script);
    }
  }, [html]);

  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
