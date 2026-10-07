import { type ComponentProps } from 'react'
import { useTranslation } from 'react-i18next'

import { registerTranslations, useUiLanguage } from '../../lib/i18n'
import { Input } from './input'

registerTranslations('colorPicker', {
  choose: 'Choose a color',
  hint: 'Click the swatch to open the color picker.',
})

/** Uses the platform's accessible visual picker; values remain opaque six-digit hex. */
export function ColorPicker({
  value,
  onValueChange,
  ...props
}: Omit<ComponentProps<typeof Input>, 'type' | 'value' | 'onChange'> & {
  value: string
  onValueChange: (value: string) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('colorPicker')
  return (
    <div className="flex items-center gap-3">
      <Input
        {...props}
        type="color"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        className="color-picker-input"
      />
      <label htmlFor={props.id} className="cursor-pointer text-sm">
        <span className="block font-medium">{t('choose')}</span>
        <span className="block text-xs text-muted-foreground">{t('hint')}</span>
      </label>
    </div>
  )
}
