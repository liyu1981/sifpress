import { Moon, Monitor, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useTheme } from '@/lib/theme'
import type { Theme } from '@/lib/theme'

const ORDER: Theme[] = ['light', 'dark', 'system']

const ICONS = {
  light: Sun,
  dark: Moon,
  system: Monitor,
} as const

const THEME_LABEL: Record<Theme, string> = {
  light: 'theme.light',
  dark: 'theme.dark',
  system: 'theme.system',
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const { t } = useTranslation()

  const Icon = ICONS[theme]
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]
  const label = t('theme.current', { theme: t(THEME_LABEL[theme]) })

  return (
    <Button
      variant="ghost"
      size="icon"
      title={`${t('theme.toggle')} — ${label}`}
      aria-label={`${t('theme.toggle')} — ${label}`}
      onClick={() => setTheme(next)}
    >
      <Icon className="size-4" />
    </Button>
  )
}
