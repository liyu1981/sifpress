import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function LanguageToggle() {
  const { i18n, t } = useTranslation()

  const current = i18n.language?.startsWith('zh') ? 'zh' : 'en'
  const next = current === 'en' ? 'zh' : 'en'

  return (
    <Button
      variant="glass"
      size="sm"
      title={t('language.toggle')}
      aria-label={t('language.toggle')}
      onClick={() => i18n.changeLanguage(next)}
    >
      {current === 'en' ? 'EN' : '中文'}
    </Button>
  )
}
