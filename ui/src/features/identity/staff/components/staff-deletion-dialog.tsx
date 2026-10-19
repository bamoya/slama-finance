import {
  useConfirmStaffDeletion,
  usePreviewStaffDeletion,
} from '../../../../api/generated/identity/identity'
import { DeletionImpactSummary } from '../../../../components/management/deletion-impact-summary'
import { ImpactConfirmationDialog } from '../../../../components/management/impact-confirmation-dialog'
import { translate } from '../../../../lib/i18n'

export function StaffDeletionDialog({
  selected,
  compact,
  initiallyOpen,
  onDismiss,
  onComplete,
}: {
  selected: { id: string }[]
  compact?: boolean
  initiallyOpen?: boolean
  onDismiss?: () => void
  onComplete: () => Promise<unknown>
}) {
  const preview = usePreviewStaffDeletion()
  const confirm = useConfirmStaffDeletion()
  const selection = { ids: selected.map((row) => row.id) }
  return (
    <ImpactConfirmationDialog
      label={translate('Delete account')}
      iconOnly={compact}
      description={translate(
        'Account access and personal details will be removed. Audit and business history remain attributed to “Deleted user”. Owned schedules stop. You cannot delete yourself or the last active administrator.',
      )}
      previewKey={JSON.stringify(selection)}
      initiallyOpen={initiallyOpen}
      onDismiss={onDismiss}
      loadPreview={async () => {
        const impact = await preview.mutateAsync({ data: selection })
        return {
          token: impact.token,
          blocked: !!impact.blockers.length,
          content: <DeletionImpactSummary groups={impact.groups} />,
        }
      }}
      onConfirm={async (token) => {
        await confirm.mutateAsync({ data: { ...selection, token } })
        await onComplete()
      }}
    />
  )
}
