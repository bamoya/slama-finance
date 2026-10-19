import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  DeliveryNotePageItemsItem,
  EstimatePageItemsItem,
  InvoicePageItemsItem,
  PaymentPageItemsItem,
} from '../../../api/generated/models'
import { useRegenerateDocumentPdf } from '../../../api/generated/sales/sales'
import { RegenerateDocumentPdfInputSchema } from '../../../api/generated/schemas/sales/artifacts.schemas'
import { type BulkAction, BulkActions } from '../../../components/management/bulk-actions'
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { useDeliveryActions } from '../delivery-notes/queries'
import { InvoiceCancellationDialog } from '../invoices/components/invoice-cancellation-dialog'
import { usePaymentActions } from '../payments/queries'
import { refreshSales } from '../refresh'
import { SalesCancellationDialog } from './sales-cancellation-dialog'
import { SalesDeletionDialog } from './sales-deletion-dialog'
import { useBulkPdfAction } from './use-bulk-pdf-action'

export type SalesBulkResource = 'estimates' | 'invoices' | 'delivery_notes' | 'payments'
export type SalesBulkRow =
  EstimatePageItemsItem | InvoicePageItemsItem | DeliveryNotePageItemsItem | PaymentPageItemsItem
type Row = SalesBulkRow

export function SalesBulkActions({
  resource,
  selected,
  clear,
}: {
  resource: SalesBulkResource
  selected: Row[]
  clear: () => void
}) {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  const { t: sales } = useTranslation('sales')
  const { can } = useAuthorization()
  const cache = useQueryClient()
  const id = useId()
  const [design, setDesign] = useState('saved')
  const deliveries = useDeliveryActions()
  const payments = usePaymentActions()
  const regenerate = useRegenerateDocumentPdf({ request: { timeout: 60_000 } })
  const actions: BulkAction<Row>[] = []
  const pdfAction = useBulkPdfAction(resource)
  if (can(`${resource}.read`)) actions.push(pdfAction)
  if (resource === 'invoices' && can('invoices.update'))
    actions.push({
      key: 'cancel',
      label: t('cancelRecords'),
      destructive: true,
      renderConfirmation: (rows, complete, dismiss) => (
        <InvoiceCancellationDialog
          selected={rows}
          triggerLabel={t('cancelRecords')}
          initiallyOpen
          onDismiss={dismiss}
          onComplete={complete}
        />
      ),
    })
  if (resource !== 'invoices' && can(`${resource}.update`))
    actions.push({
      key: 'cancel',
      label: t('cancelRecords'),
      destructive: true,
      renderConfirmation: (rows, complete, dismiss) => (
        <SalesCancellationDialog
          resource={resource}
          selected={rows}
          triggerLabel={t('cancelRecords')}
          initiallyOpen
          onDismiss={dismiss}
          onComplete={complete}
        />
      ),
    })
  if (can(`${resource}.delete`))
    actions.push({
      key: 'delete',
      label: t('delete'),
      destructive: true,
      renderConfirmation: (rows, complete, dismiss) => (
        <SalesDeletionDialog
          resource={resource}
          selected={rows}
          initiallyOpen
          onDismiss={dismiss}
          onComplete={complete}
        />
      ),
    })
  if (resource === 'payments' && can('payments.update'))
    actions.push({
      key: 'restore',
      label: t('restore'),
      eligible: (row) => row.status === 'cancelled',
      run: (row) => payments.restore(row.id, { expectedVersion: row.version }),
    })
  if (resource === 'delivery_notes' && can('delivery_notes.update'))
    actions.push({
      key: 'deliver',
      label: t('deliver'),
      eligible: (row) => row.status === 'draft',
      run: (row) => deliveries.deliver(row.id, row.version),
    })
  if (resource !== 'payments' && can(`${resource}.update`))
    actions.push({
      key: 'regenerate',
      label: sales('regeneratePdf'),
      eligible: (row) => row.status !== 'draft',
      content: (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={`${id}-design`}>{sales('pdfDesign')}</FieldLabel>
            <Select id={`${id}-design`} value={design} onValueChange={setDesign}>
              <SelectGroup>
                <SelectOption value="saved">{sales('savedPdfDesign')}</SelectOption>
                <SelectOption value="latest">{sales('latestPdfDesign')}</SelectOption>
              </SelectGroup>
            </Select>
          </Field>
          <p className="text-sm text-muted-foreground">{sales('regeneratePdfDescription')}</p>
        </FieldGroup>
      ),
      run: (row) =>
        regenerate.mutateAsync({
          documentType:
            resource === 'estimates'
              ? 'estimate'
              : resource === 'invoices'
                ? 'invoice'
                : 'delivery_note',
          id: row.id,
          data: RegenerateDocumentPdfInputSchema.parse({ design }),
        }),
    })
  return (
    <BulkActions
      selected={selected}
      actions={actions}
      name={(row) =>
        row.number ??
        `${sales(resource === 'estimates' ? 'draftEstimate' : resource === 'invoices' ? 'draftInvoice' : 'draftDelivery')} · ${row.id.slice(0, 8)}`
      }
      clear={clear}
      refresh={() => refreshSales(cache)}
    />
  )
}
