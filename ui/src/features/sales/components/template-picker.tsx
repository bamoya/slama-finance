import { useTranslation } from 'react-i18next'

import { Combobox } from '../../../components/ui/combobox'
import { useUiLanguage } from '../../../lib/i18n'
import { useDocumentTemplates } from '../../settings'

export function TemplatePicker({
  value,
  onValueChange,
}: {
  value: string | null
  onValueChange: (value: string | null) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const templates = useDocumentTemplates()
  return (
    <Combobox
      aria-label={t('pdfTemplate')}
      value={value ?? ''}
      onValueChange={(next) => onValueChange(next || null)}
      options={
        templates.data?.map((template) => ({ value: template.id, label: template.name })) ?? []
      }
      placeholder={t('pdfTemplate')}
      clearLabel={t('companyDefault')}
      selectedLabel={templates.data?.find((template) => template.id === value)?.name}
      loading={templates.isPending}
      error={templates.isError}
      onRetry={() => void templates.refetch()}
    />
  )
}
