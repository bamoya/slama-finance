import '../translations'

import { useTranslation } from 'react-i18next'

import { CreateDocumentTemplateSchema } from '../../../../api/generated/schemas/settings/settings.schemas'
import { ToggleGroup, ToggleGroupItem } from '../../../../components/ui/toggle-group'
import { useUiLanguage } from '../../../../lib/i18n'

export function DensityPicker({
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
        onValueChange={(next) => {
          const result = CreateDocumentTemplateSchema.shape.density.safeParse(next)
          if (result.success) onChange(result.data)
        }}
        variant="outline"
        spacing={2}
        className="w-fit"
        aria-label={t('density')}
      >
        <ToggleGroupItem value="standard">{t('standard')}</ToggleGroupItem>
        <ToggleGroupItem value="compact">{t('compactDensity')}</ToggleGroupItem>
      </ToggleGroup>
      <p className="text-xs text-muted-foreground">{t('densityHint')}</p>
    </div>
  )
}
