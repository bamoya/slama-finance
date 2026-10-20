import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { SalesDeletionSelection } from '../../../api/generated/models'
import {
  useConfirmSalesDeletion,
  usePreviewSalesDeletion,
} from '../../../api/generated/sales/sales'
import { DeletionCascadeOption } from '../../../components/management/deletion-cascade-option'
import { ImpactConfirmationDialog } from '../../../components/management/impact-confirmation-dialog'
import { registerTranslations } from '../../../lib/i18n'

registerTranslations('salesDeletion', {
  title: 'Delete permanently',
  warning:
    'Permanent deletion cannot be undone. Review all affected records before confirming. Sent emails and real banking operations cannot be reversed.',
  cascade: 'Also delete linked invoices, payments, receipts and delivery notes',
  delete: 'Will delete',
  detach: 'Will preserve and detach',
  estimates: 'Estimates',
  invoices: 'Invoices',
  delivery_notes: 'Delivery notes',
  payments: 'Payments',
  files: 'Files released for cleanup: {{count}}',
  retained: 'Shared files retained: {{count}}',
  jobs: 'Pending or running preparation jobs stopped: {{count}}',
  emails: 'Pending emails stopped: {{count}}',
  sending: 'An email is being sent. Wait for delivery to finish, then review again.',
  unnamed: 'Unnumbered draft',
})

export function SalesDeletionDialog({
  resource,
  selected,
  disabled,
  initiallyOpen,
  onDismiss,
  onComplete,
}: {
  resource: SalesDeletionSelection['resource']
  selected: { id: string; version: number }[]
  disabled?: boolean
  initiallyOpen?: boolean
  onDismiss?: () => void
  onComplete: () => Promise<unknown>
}) {
  const { t } = useTranslation('salesDeletion')
  const [cascadeInvoices, setCascadeInvoices] = useState(false)
  const preview = usePreviewSalesDeletion()
  const confirm = useConfirmSalesDeletion()
  const selection = {
    resource,
    records: selected.map((row) => ({ id: row.id, expectedVersion: row.version })),
    cascadeInvoices,
  }
  return (
    <ImpactConfirmationDialog
      label={t('title')}
      description={t('warning')}
      previewKey={JSON.stringify(selection)}
      disabled={disabled}
      initiallyOpen={initiallyOpen}
      onDismiss={() => {
        setCascadeInvoices(false)
        onDismiss?.()
      }}
      options={
        resource === 'estimates' ? (
          <DeletionCascadeOption
            checked={cascadeInvoices}
            onCheckedChange={setCascadeInvoices}
            label={t('cascade')}
          />
        ) : undefined
      }
      loadPreview={async () => {
        const impact = await preview.mutateAsync({ data: selection })
        return {
          token: impact.token,
          blocked: !!impact.blockers.length,
          content: (
            <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
              {impact.groups.map((group) => (
                <section key={`${group.operation}-${group.resource}`}>
                  <h3 className="font-semibold">
                    {t(group.operation)} · {t(group.resource)} ({group.records.length})
                  </h3>
                  <ul className="mt-1 max-h-28 overflow-auto break-words text-muted-foreground">
                    {group.records.map((row) => (
                      <li key={row.id}>{row.name ?? `${t('unnamed')} · ${row.id.slice(0, 8)}`}</li>
                    ))}
                  </ul>
                </section>
              ))}
              <p>{t('files', { count: impact.files })}</p>
              {!!impact.retainedFiles && <p>{t('retained', { count: impact.retainedFiles })}</p>}
              <p>{t('jobs', { count: impact.jobs })}</p>
              <p>{t('emails', { count: impact.emails })}</p>
              {!!impact.blockers.length && (
                <p role="alert" className="text-[var(--error-text)]">
                  {t('sending')}
                </p>
              )}
            </div>
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
