import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { KvAttrs } from 'ui-sdk';
import { settingsApi, tagsApi } from 'ui-sdk';
import { kv, useThemeConfig } from '@/lib/theme-config';

function FooterColumn({
  title,
  inspectKey,
  children,
}: {
  title: string;
  inspectKey?: KvAttrs;
  children: React.ReactNode;
}) {
  return (
    <div {...inspectKey}>
      <h3 className="text-[11px] font-semibold tracking-[0.18em] text-ink-faint uppercase">
        {title}
      </h3>
      <div className="mt-4 space-y-2.5">{children}</div>
    </div>
  );
}

export function SiteFooter() {
  const { footerAbout, footerLinks, footerSocials } = useThemeConfig();

  const settings = useQuery({
    queryKey: ['seo-settings'],
    queryFn: settingsApi.get,
    staleTime: 60_000,
  });

  const tags = useQuery({
    queryKey: ['tags'],
    queryFn: () => tagsApi.list(),
    staleTime: 60_000,
  });

  const siteName = settings.data?.site_name?.trim() || 'Sifpress';
  const tagline = footerAbout || settings.data?.site_description || '';
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-rule-strong bg-paper-raised">
      <div className="mx-auto w-full max-w-8xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link to="/" className="wordmark decoration-none text-2xl">
              {siteName}
            </Link>
            {tagline !== '' && (
              <p {...kv('footer.about')} className="dek mt-3 max-w-sm text-base">
                {tagline}
              </p>
            )}

            {footerSocials.length > 0 && (
              <div {...kv('footer.socials')} className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
                {footerSocials.map(link => (
                  <a
                    key={link.href}
                    href={link.href}
                    target={link.href.startsWith('http') ? '_blank' : undefined}
                    rel={link.href.startsWith('http') ? 'noreferrer noopener' : undefined}
                    className="text-sm text-ink-soft transition-colors hover:text-brand"
                  >
                    {link.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {(tags.data ?? []).length > 0 && (
            <FooterColumn title="Sections">
              {(tags.data ?? []).slice(0, 6).map(tag => (
                <Link
                  key={tag.name}
                  to="/section/$section"
                  params={{ section: tag.name }}
                  className="block text-sm text-ink-soft transition-colors hover:text-ink"
                >
                  {tag.name}
                </Link>
              ))}
            </FooterColumn>
          )}

          {footerLinks.length > 0 && (
            <FooterColumn title="Explore" inspectKey={kv('footer.links')}>
              {footerLinks.map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block text-sm text-ink-soft transition-colors hover:text-ink"
                >
                  {link.label}
                </a>
              ))}
            </FooterColumn>
          )}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-rule pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="meta-line">
            © {year} {siteName}
          </p>
          <p className="meta-line">
            Published with <span className="font-semibold text-ink-soft">Sifpress</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
