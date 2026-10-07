import { Copy, Eye, Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { DocumentTemplate } from '../../../../api/generated/schemas/settings/settings.schemas'
import { MoreAction, MoreActions } from '../../../../components/management/more-actions'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../../identity'
import { SettingsRecordActions } from '../../shared/components/settings-record-actions'
export function TemplateListActions({
  template,
  suffix,
}: {
  template: DocumentTemplate
  suffix: string
}) {
  useUiLanguage()

  const { t } = useTranslation('templates')
  const base = `/settings/invoice-appearance/${template.id}`
  return (
    <MoreActions compact label={t('actionsFor', { name: template.name })}>
      <MoreAction label={t('view')} icon={<Eye />} href={base + suffix} />
      <Can permission="templates.update">
        {!template.archivedAt && (
          <MoreAction label={t('edit')} icon={<Pencil />} href={base + '/edit' + suffix} />
        )}
      </Can>
      <Can permission="templates.create">
        <MoreAction
          label={t('duplicate')}
          icon={<Copy />}
          href={`/settings/invoice-appearance/new?copy=${template.id}`}
        />
      </Can>
      <SettingsRecordActions resource="template" record={template} />
    </MoreActions>
  )
}
