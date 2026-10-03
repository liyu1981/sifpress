import { socialIconPath } from '@/lib/theme-config';

export function BrandIcon({ icon, className = 'size-4' }: { icon?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      focusable="false"
    >
      <path d={socialIconPath(icon)} />
    </svg>
  );
}
