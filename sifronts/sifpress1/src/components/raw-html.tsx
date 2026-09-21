import { useEffect, useRef } from 'react';

/**
 * Renders trusted, admin-authored raw HTML (e.g. a Disqus or Remark42
 * embed) directly below the article. The markup is written into the
 * container imperatively, never through React's `dangerouslySetInnerHTML`,
 * so React always sees a childless node and never reconciles — and
 * therefore never removes — the DOM that third-party scripts inject
 * (the Remark42 iframe lives here). The `rendered` ref makes the write
 * idempotent, so re-renders are no-ops and the embed loads exactly once.
 *
 * `innerHTML` never executes `<script>` tags, so inline/external scripts
 * are recreated after the write to run. Pair this with a per-article
 * `key` (see `article.$slug.tsx`) so SPA navigation mounts a fresh
 * container instead of reusing the previous article's iframe.
 */
export function RawHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const rendered = useRef<string | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (container === null || rendered.current === html) {
      return;
    }

    rendered.current = html;
    container.innerHTML = html;

    for (const original of Array.from(container.querySelectorAll('script'))) {
      const script = document.createElement('script');
      for (const attr of Array.from(original.attributes)) {
        script.setAttribute(attr.name, attr.value);
      }
      script.text = original.text;
      script.dataset.executed = 'true';
      original.replaceWith(script);
    }
  }, [html]);

  return <div ref={ref} className={className} />;
}
