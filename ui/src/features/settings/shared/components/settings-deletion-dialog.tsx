import {
  useConfirmSettingsDeletion,
  usePreviewSettingsDeletion,
} from '../../../../api/generated/settings/settings'
import { DeletionImpactSummary } from '../../../../components/management/deletion-impact-summary'
import { ImpactConfirmationDialog } from '../../../../components/management/impact-confirmation-dialog'
import { translate } from '../../../../lib/i18n'

export function SettingsDeletionDialog({
  resource,
  selected,
  compact,
  initiallyOpen,
  onDismiss,
  onComplete,
}: {
  resource: 'bank' | 'template'
  selected: { id: string; version: number }[]
  compact?: boolean
  initiallyOpen?: boolean
  onDismiss?: () => void
  onComplete: () => Promise<unknown>
}) {
  const preview = usePreviewSettingsDeletion(),
    confirm = useConfirmSettingsDeletion()
  const selection = {
    resource: resource === 'bank' ? ('bank_accounts' as const) : ('templates' as const),
    records: selected.map((row) => ({ id: row.id, expectedVersion: row.version })),
  }
  return (
    <ImpactConfirmationDialog
      label={translate('Delete permanently')}
      iconOnly={compact}
      initiallyOpen={initiallyOpen}
      onDismiss={onDismiss}
      description={translate(
        'Company defaults and live references will be cleared. Documents, payment history and saved designs remain unchanged. Images needed by existing documents are retained.',
      )}
      previewKey={JSON.stringify(selection)}
      loadPreview={async () => {
        const impact = await preview.mutateAsync({ data: selection })
        return {
          token: impact.token,
          blocked: !!impact.blockers.length,
          content: <DeletionImpactSummary {...impact} />,
        }
      }}
      onConfirm={async (token) => {
        await confirm.mutateAsync({ data: { ...selection, token } })
        await onComplete()
      }}
    />
  )
}
