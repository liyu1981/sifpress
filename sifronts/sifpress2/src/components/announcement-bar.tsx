import { Megaphone } from 'lucide-react';
import { useThemeConfig } from '@/lib/theme-config';

export function AnnouncementBar() {
  const { announcement } = useThemeConfig();

  if (announcement === null) {
    return null;
  }

  const body = (
    <>
      <Megaphone className="size-3.5 shrink-0 text-brand" />
      <span className="truncate text-[13px] text-ink-soft">{announcement.text}</span>
      <span className="hidden items-center gap-1 text-[13px] font-semibold text-brand sm:inline-flex">
        {announcement.cta}
        <span aria-hidden="true">→</span>
      </span>
    </>
  );

  const className =
    'flex items-center justify-center gap-2 border-b border-rule bg-brand/5 px-4 py-2 text-center';

  if (announcement.href === '') {
    return (
      <div className={className} role="status">
        {body}
      </div>
    );
  }

  return (
    <a href={announcement.href} className={`${className} transition-colors hover:bg-brand/10`}>
      {body}
    </a>
  );
}
