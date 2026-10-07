import { Languages } from 'lucide-react'

import { setUiLanguage, translate, useUiLanguage } from '../../lib/i18n'
import { Button } from './button'

/** Two supported languages; one shared control for private and public layouts. */
export function LanguageSwitcher() {
  const language = useUiLanguage()
  const next = language === 'fr' ? 'en' : 'fr'
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label={translate('Language')}
      title={next === 'fr' ? 'Français' : translate('English')}
      onClick={() => void setUiLanguage(next)}
    >
      <Languages data-icon="inline-start" />
      {language.toUpperCase()}
    </Button>
  )
}
