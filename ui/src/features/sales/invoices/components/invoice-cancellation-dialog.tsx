import { useTranslation } from 'react-i18next'

import {
  useConfirmInvoiceCancellation,
  usePreviewInvoiceCancellation,
} from '../../../../api/generated/sales/sales'
import { ConfirmInvoiceCancellationSchema } from '../../../../api/generated/schemas/sales/actions.schemas'
import { CancellationDialog } from '../../../../components/management/cancellation-dialog'
import { registerTranslations } from '../../../../lib/i18n'

registerTranslations('invoiceCancellation', {
  title: 'Cancel invoices',
  description:
    'All listed records will be cancelled together. No records will be deleted. This does not reverse bank transfers or physical deliveries.',
  invoices: 'Invoices to cancel',
  payments: 'Payments to cancel',
  deliveryNotes: 'Delivery notes to cancel',
  receipts: 'Issued receipts invalidated: {{count}}',
  preserved: 'Already cancelled records preserved: {{count}}',
  queued: 'Pending related emails will be stopped. Historical records are retained.',
  unnamed: 'Unnumbered draft',
})

export function InvoiceCancellationDialog({
  selected,
  triggerLabel,
  disabled,
  initiallyOpen,
  onDismiss,
  onComplete,
}: {
  selected: { id: string; version: number }[]
  triggerLabel: string
  disabled?: boolean
  initiallyOpen?: boolean
  onDismiss?: () => void
  onComplete: () => Promise<unknown>
}) {
  const { t } = useTranslation('invoiceCancellation')
  const preview = usePreviewInvoiceCancellation()
  const confirm = useConfirmInvoiceCancellation()
  const selection = {
    invoices: selected.map((row) => ({ id: row.id, expectedVersion: row.version })),
  }
  return (
    <CancellationDialog
      title={t('title')}
      triggerLabel={triggerLabel}
      description={t('description')}
      disabled={disabled}
      initiallyOpen={initiallyOpen}
      onDismiss={onDismiss}
      validateReason={(reason) =>
        ConfirmInvoiceCancellationSchema.shape.reason.safeParse(reason).success
      }
      preview={async () => {
        const impact = await preview.mutateAsync({ data: selection })
        return {
          token: impact.token,
          content: (
            <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
              {(['invoices', 'payments', 'deliveryNotes'] as const).map((group) => (
                <section key={group}>
                  <h3 className="font-semibold">
                    {t(group)} ({impact[group].length})
                  </h3>
                  {!!impact[group].length && (
                    <ul className="mt-1 max-h-28 overflow-auto break-words text-muted-foreground">
                      {impact[group].map((row) => (
                        <li key={row.id}>
                          {row.name ?? `${t('unnamed')} · ${row.id.slice(0, 8)}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
              <p>{t('receipts', { count: impact.receipts })}</p>
              {!!impact.alreadyCancelled && (
                <p>{t('preserved', { count: impact.alreadyCancelled })}</p>
              )}
              <p className="text-muted-foreground">{t('queued')}</p>
            </div>
          ),
        }
      }}
      onConfirm={async (reason, token) => {
        await confirm.mutateAsync({
          data: ConfirmInvoiceCancellationSchema.parse({ ...selection, reason, token }),
        })
        await onComplete()
      }}
    />
  )
}
