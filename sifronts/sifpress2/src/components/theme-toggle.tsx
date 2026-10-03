import { Monitor, Moon, Sun } from 'lucide-react';
import { type Theme, useTheme } from '@/lib/theme';

const ORDER: Theme[] = ['light', 'dark', 'system'];

const ICONS: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  system: 'System',
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = ICONS[theme];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={`Theme: ${LABELS[theme]}`}
      aria-label={`Theme: ${LABELS[theme]}. Switch to ${LABELS[next].toLowerCase()}.`}
      className="inline-flex size-9 items-center justify-center rounded-[3px] text-ink-soft transition-colors hover:bg-muted hover:text-ink"
    >
      <Icon className="size-4" />
    </button>
  );
}
