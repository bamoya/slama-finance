import { useId, useState } from 'react'

import {
  useConfirmClientDeletion,
  usePreviewClientDeletion,
} from '../../../api/generated/clients/clients'
import { DeletionImpactSummary } from '../../../components/management/deletion-impact-summary'
import { ImpactConfirmationDialog } from '../../../components/management/impact-confirmation-dialog'
import { Checkbox } from '../../../components/ui/checkbox'
import { Field, FieldLabel } from '../../../components/ui/field'
import { translate } from '../../../lib/i18n'

export function ClientDeletionDialog({
  selected,
  compact,
  initiallyOpen,
  onDismiss,
  onComplete,
}: {
  selected: { id: string; version: number }[]
  compact?: boolean
  initiallyOpen?: boolean
  onDismiss?: () => void
  onComplete: () => Promise<unknown>
}) {
  const id = useId()
  const [cascadeDocuments, setCascadeDocuments] = useState(false)
  const preview = usePreviewClientDeletion()
  const confirm = useConfirmClientDeletion()
  const selection = {
    records: selected.map((row) => ({ id: row.id, expectedVersion: row.version })),
    cascadeDocuments,
  }
  return (
    <ImpactConfirmationDialog
      label={translate('Delete permanently')}
      iconOnly={compact}
      initiallyOpen={initiallyOpen}
      onDismiss={() => {
        setCascadeDocuments(false)
        onDismiss?.()
      }}
      description={translate(
        'Documents are preserved with their saved client identity unless you explicitly choose to delete them. Pending client emails are removed. Deletion cannot be undone.',
      )}
      previewKey={JSON.stringify(selection)}
      options={
        <Field className="flex-row items-start gap-3">
          <Checkbox
            id={id}
            checked={cascadeDocuments}
            onCheckedChange={(value) => setCascadeDocuments(value === true)}
          />
          <FieldLabel htmlFor={id}>
            {translate('Also delete all related estimates, invoices, delivery notes and payments')}
          </FieldLabel>
        </Field>
      }
      loadPreview={async () => {
        const impact = await preview.mutateAsync({ data: selection })
        return {
          token: impact.token,
          blocked: !!impact.blockers.length,
          content: (
            <>
              <DeletionImpactSummary {...impact} />
              {impact.blockers.map((reason) => (
                <p key={reason} className="text-[var(--error-text)]">
                  {translate(reason)}
                </p>
              ))}
            </>
          ),
        }
      }}
      onConfirm={async (token) => {
        await confirm.mutateAsync({ data: { ...selection, token } })
        await onComplete()
      }}
    />
  )
}
