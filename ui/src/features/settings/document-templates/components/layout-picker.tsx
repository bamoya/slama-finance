import '../translations'

import { useTranslation } from 'react-i18next'

import { ToggleGroup, ToggleGroupItem } from '../../../../components/ui/toggle-group'
import { useUiLanguage } from '../../../../lib/i18n'
import { layoutLabelKey, templateLayouts } from '../utils/design-options'

export function LayoutPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('templates')
  return (
    <div className="grid gap-3">
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={(next) => next && onChange(next)}
        variant="outline"
        className="template-layout-picker"
        aria-label={t('layout')}
      >
        {templateLayouts.map((layout) => (
          <ToggleGroupItem
            key={layout}
            value={layout}
            className="template-layout-option"
            aria-label={t(layoutLabelKey(layout))}
          >
            <span aria-hidden="true" className={`template-thumbnail template-thumbnail-${layout}`}>
              <span className="template-thumbnail-header" />
              <span className="template-thumbnail-address" />
              <span className="template-thumbnail-lines" />
              <span className="template-thumbnail-total" />
            </span>
            <span>{t(layoutLabelKey(layout))}</span>
            <span className="whitespace-normal text-xs font-normal">{t(`${layout}Hint`)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">{t('fixed')}</p>
    </div>
  )
}
