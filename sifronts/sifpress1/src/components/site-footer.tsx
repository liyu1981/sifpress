export function SiteFooter() {
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-6 pb-2 text-sm text-muted-foreground">
      <span>
        Powered by Sifpress
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
      <span>© {new Date().getFullYear()}</span>
    </footer>
  );
}
