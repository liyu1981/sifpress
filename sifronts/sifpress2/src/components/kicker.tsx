import { Link } from '@tanstack/react-router';

export function SectionLink({
  section,
  className = 'kicker',
  children,
}: {
  section: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Link
      to="/section/$section"
      params={{ section }}
      className={`${className} decoration-none transition-colors hover:text-brand-ink`}
    >
      {children ?? section}
    </Link>
  );
}

export function FeaturedTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-[3px] border border-brand/40 bg-brand/8 px-2 py-0.5 text-[11px] font-semibold tracking-[0.14em] text-brand uppercase">
      {label}
    </span>
  );
}

export function Rule({ strong = false, className = '' }: { strong?: boolean; className?: string }) {
  return (
    <div aria-hidden="true" className={`${strong ? 'rule-top-strong' : 'rule-top'} ${className}`} />
  );
}
