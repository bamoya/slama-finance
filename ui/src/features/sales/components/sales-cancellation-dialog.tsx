import {
  useConfirmSalesCancellation,
  usePreviewSalesCancellation,
} from '../../../api/generated/sales/sales'
import { ConfirmSalesCancellationSchema } from '../../../api/generated/schemas/sales/cancellation.schemas'
import { CancellationDialog } from '../../../components/management/cancellation-dialog'
import { translate } from '../../../lib/i18n'

export function SalesCancellationDialog({
  resource,
  selected,
  triggerLabel,
  disabled,
  initiallyOpen,
  onDismiss,
  onComplete,
}: {
  resource: 'estimates' | 'delivery_notes' | 'payments'
  selected: { id: string; version: number }[]
  triggerLabel: string
  disabled?: boolean
  initiallyOpen?: boolean
  onDismiss?: () => void
  onComplete: () => Promise<unknown>
}) {
  const preview = usePreviewSalesCancellation(),
    confirm = useConfirmSalesCancellation()
  const selection = {
    resource,
    records: selected.map((row) => ({ id: row.id, expectedVersion: row.version })),
  }
  return (
    <CancellationDialog
      triggerLabel={triggerLabel}
      title={triggerLabel}
      disabled={disabled}
      initiallyOpen={initiallyOpen}
      onDismiss={onDismiss}
      description={translate(
        'Only the listed records will be cancelled. Related invoices, estimates, delivery notes and payments remain unchanged. No real transfer or physical delivery is reversed.',
      )}
      validateReason={(reason) =>
        ConfirmSalesCancellationSchema.shape.reason.safeParse(reason).success
      }
      preview={async () => {
        const impact = await preview.mutateAsync({ data: selection })
        return {
          token: impact.token,
          content: (
            <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
              <p>
                {translate('Records to cancel')}: {impact.records.length}
              </p>
              <ul className="max-h-40 overflow-auto">
                {impact.records.map((row) => (
                  <li key={row.id}>{row.name ?? row.id.slice(0, 8)}</li>
                ))}
              </ul>
              {!!impact.receipts && (
                <p>
                  {translate('Issued receipts invalidated: {{count}}', { count: impact.receipts })}
                </p>
              )}
              <p>
                {translate(
                  'Pending related emails will be stopped. Historical records are retained.',
                )}
              </p>
            </div>
          ),
        }
      }}
      onConfirm={async (reason, token) => {
        await confirm.mutateAsync({
          data: ConfirmSalesCancellationSchema.parse({ ...selection, reason, token }),
        })
        await onComplete()
      }}
    />
  )
}
