import { Monitor, Moon, Sun } from 'lucide-react';
import type { Theme } from '@/lib/theme';
import { useTheme } from '@/lib/theme';
import { cn } from '@/lib/utils';

const ORDER: Theme[] = ['light', 'dark', 'system'];

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const;

const LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const Icon = ICONS[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      title={`Theme: ${LABELS[theme]}`}
      aria-label={`Theme: ${LABELS[theme]}`}
      onClick={() => setTheme(next)}
      className={cn(
        'inline-flex items-center justify-center rounded-md p-2 text-sm',
        'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
      )}
    >
      <Icon className="size-4" />
    </button>
  );
}
