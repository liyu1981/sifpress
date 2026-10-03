import { Check, Link2 } from 'lucide-react';
import { useState } from 'react';
import { copyText } from 'ui-sdk';
import { BrandIcon } from '@/components/brand-icon';
import { useCopy } from '@/lib/theme-config';

export function ShareLinks({ title }: { title: string }) {
  const copy = useCopy();
  const [copied, setCopied] = useState(false);

  const url = typeof window === 'undefined' ? '' : window.location.href;
  const encodedUrl = encodeURIComponent(url);
  const encodedTitle = encodeURIComponent(title);

  const targets = [
    {
      label: 'X',
      href: `https://x.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
      icon: 'x',
    },
    {
      label: 'LinkedIn',
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
      icon: 'linkedin',
    },
  ];

  const onCopy = async (): Promise<void> => {
    await copyText(url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const buttonClass =
    'inline-flex size-8 items-center justify-center rounded-full border border-rule text-ink-soft transition-colors hover:border-ink hover:text-ink';

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
        {copy('share')}
      </span>
      {targets.map(target => (
        <a
          key={target.label}
          href={target.href}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={`Share on ${target.label}`}
          className={buttonClass}
        >
          <BrandIcon icon={target.icon} className="size-3.5" />
        </a>
      ))}
      <button type="button" onClick={onCopy} aria-label="Copy link" className={buttonClass}>
        {copied ? <Check className="size-3.5 text-brand" /> : <Link2 className="size-3.5" />}
      </button>
    </div>
  );
}
