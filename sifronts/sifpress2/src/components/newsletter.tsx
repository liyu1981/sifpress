import { ArrowRight } from 'lucide-react';
import { kv, useThemeConfig } from '@/lib/theme-config';

export function NewsletterBand() {
  const { newsletter, mastheadTagline } = useThemeConfig();

  if (newsletter === null) {
    return null;
  }

  const inner = (
    <div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
      <div className="max-w-xl">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-brand/80 uppercase">
          Newsletter
        </p>
        <h2
          {...kv('newsletter.heading')}
          className="headline-tight mt-2 text-2xl text-ink sm:text-3xl"
        >
          {newsletter.heading}
        </h2>
        {(newsletter.body !== '' || mastheadTagline !== '') && (
          <p {...kv('newsletter.body')} className="dek mt-2 max-w-lg">
            {newsletter.body !== '' ? newsletter.body : mastheadTagline}
          </p>
        )}
      </div>

      <span
        {...kv('newsletter.cta')}
        className="inline-flex shrink-0 items-center gap-2 rounded-[3px] bg-ink px-4 py-2.5 text-sm font-semibold text-paper"
      >
        {newsletter.cta}
        <ArrowRight className="size-4" />
      </span>
    </div>
  );

  const className = 'rule-top-strong mt-12 pt-6';

  if (newsletter.href === '') {
    return <section className={className}>{inner}</section>;
  }

  return (
    <section className={className}>
      <a
        {...kv('newsletter.href')}
        href={newsletter.href}
        target="_blank"
        rel="noreferrer noopener"
        className="block transition-opacity duration-200 hover:opacity-80"
      >
        {inner}
      </a>
    </section>
  );
}
