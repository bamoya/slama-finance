import { translate } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { useDocumentTemplates } from '../../settings'

export function DocumentTemplateSummary({ templateId }: { templateId?: string | null }) {
  const { can } = useAuthorization()
  const templates = useDocumentTemplates(can('templates.read'))
  const template = templates.data?.find((item) => item.id === templateId)
  return (
    <div className="grid gap-1 text-sm" data-slot="document-template-summary">
      <span className="text-muted-foreground">{translate('Document template')}</span>
      <span className="font-medium">
        {template?.name ?? translate(templateId ? 'Saved template' : 'Company default')}
      </span>
    </div>
  )
}
