import { Link } from '@tanstack/react-router';
import { ExternalLink, Folder, Mail } from 'lucide-react';
import type { TagCount } from 'ui-sdk';
import { cn } from '@/lib/utils';

const SOCIAL_LINKS = [
  { label: 'GitHub', href: 'https://github.com/liyu1981', icon: ExternalLink },
  { label: 'LinkedIn', href: 'https://au.linkedin.com/in/liyu1981', icon: ExternalLink },
  { label: 'Email', href: 'mailto:liyu1981@gmail.com', icon: Mail },
];

export function Sidebar({ tags }: { tags: TagCount[] }) {
  return (
    <aside className="flex flex-col gap-6">
      <div className="glass-control rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Folder className="size-4" />
          Categories
        </h3>
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">No categories</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tags.map(tag => (
              <li key={tag.name}>
                <Link
                  to="/"
                  search={{ tag: tag.name }}
                  className={cn(
                    'flex items-center justify-between rounded-lg px-3 py-1.5 text-sm',
                    'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span>{tag.name}</span>
                  <span className="text-xs text-muted-foreground/60">{tag.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="glass-control rounded-2xl p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Links</h3>
        <ul className="flex flex-col gap-1.5">
          {SOCIAL_LINKS.map(link => (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm',
                  'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                )}
              >
                <link.icon className="size-4" />
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
