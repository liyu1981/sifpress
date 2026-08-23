import { useThemeConfig } from '@/lib/theme-config';

export function SiteFooter() {
  const config = useThemeConfig();
  const year = String(new Date().getFullYear());
  const copyright = config.footerCopyright.replace('{year}', year);

  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-6 pb-2 text-sm text-muted-foreground">
      <span>
        {config.footerText}
        <span aria-hidden="true"> · </span>
        <a
          href="https://github.com/liyu1981/sifpress"
          target="_blank"
          rel="noopener noreferrer"
          className="text-foreground transition-colors hover:text-muted-foreground hover:underline"
        >
          GitHub
        </a>
      </span>
      <span>{copyright}</span>
    </footer>
  );
}
