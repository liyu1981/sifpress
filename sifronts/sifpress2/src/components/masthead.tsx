import { formatDate } from '@/lib/format';
import { kv, useThemeConfig } from '@/lib/theme-config';

export function Masthead() {
  const { mastheadKicker, mastheadTagline } = useThemeConfig();

  return (
    <div className="flex flex-col gap-1 border-b border-rule-strong pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-baseline gap-3">
        {mastheadKicker !== '' && (
          <p {...kv('masthead.kicker')} className="kicker">
            {mastheadKicker}
          </p>
        )}
        <p className="meta-line">{formatDate(new Date().toISOString(), 'day')}</p>
      </div>
      {mastheadTagline !== '' && (
        <p {...kv('masthead.tagline')} className="dek max-w-xl text-base sm:text-right">
          {mastheadTagline}
        </p>
      )}
    </div>
  );
}
