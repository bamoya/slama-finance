import { Moon, Sun } from 'lucide-react'

import { translate } from '../../lib/i18n'
import { useUiLanguage } from '../../lib/i18n'
import { Button } from './button'

export function ThemeToggle({ isDark, onToggle }: { isDark: boolean; onToggle: () => void }) {
  useUiLanguage()

  const label = isDark ? translate('Switch to light mode') : translate('Switch to dark mode')
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-md"
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      {isDark ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
    </Button>
  )
}
