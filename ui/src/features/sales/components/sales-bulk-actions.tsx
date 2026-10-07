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
import { DeliveryNoteCancellationSchema } from '../../../api/generated/schemas/sales/delivery-notes.schemas'
import { EstimateCancellationSchema } from '../../../api/generated/schemas/sales/estimates.schemas'
import { InvoiceCancellationSchema } from '../../../api/generated/schemas/sales/invoices.schemas'
import { PaymentCancellationSchema } from '../../../api/generated/schemas/sales/payments.schemas'
import { type BulkAction, BulkActions } from '../../../components/management/bulk-actions'
import { Field, FieldGroup, FieldLabel } from '../../../components/ui/field'
import { Select, SelectGroup, SelectOption } from '../../../components/ui/select'
import { Textarea } from '../../../components/ui/textarea'
import { useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { useDeliveryActions } from '../delivery-notes/queries'
import { useEstimateActions } from '../estimates/queries'
import { useInvoiceActions } from '../invoices/queries'
import { usePaymentActions } from '../payments/queries'
import { refreshSales } from '../refresh'
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
  const [reason, setReason] = useState('')
  const [design, setDesign] = useState('saved')
  const estimates = useEstimateActions()
  const invoices = useInvoiceActions()
  const deliveries = useDeliveryActions()
  const payments = usePaymentActions()
  const regenerate = useRegenerateDocumentPdf({ request: { timeout: 60_000 } })
  const documents = { estimates, invoices, delivery_notes: deliveries }
  const schema = {
    estimates: EstimateCancellationSchema,
    invoices: InvoiceCancellationSchema,
    delivery_notes: DeliveryNoteCancellationSchema,
    payments: PaymentCancellationSchema,
  }[resource]
  const validReason = schema.shape.reason.safeParse(reason.trim()).success
  const actions: BulkAction<Row>[] = []
  const pdfAction = useBulkPdfAction(resource)
  if (can(`${resource}.read`)) actions.push(pdfAction)
  if (can(`${resource}.update`))
    actions.push({
      key: 'cancel',
      label: t('cancelRecords'),
      destructive: true,
      eligible: (row) =>
        resource === 'payments'
          ? row.status !== 'cancelled'
          : resource === 'delivery_notes'
            ? ['prepared', 'delivered'].includes(row.status)
            : resource === 'invoices'
              ? ['issued', 'sent'].includes(row.status)
              : !['draft', 'cancelled', 'superseded'].includes(row.status),
      disabled: !validReason,
      content: (
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor={id}>{t('reason')}</FieldLabel>
            <Textarea
              id={id}
              value={reason}
              maxLength={1000}
              placeholder={t('reasonHint')}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </FieldGroup>
      ),
      run: (row) => {
        const data = schema.parse({ expectedVersion: row.version, reason: reason.trim() })
        return resource === 'payments'
          ? payments.cancel(row.id, data)
          : documents[resource].cancel(row.id, data.expectedVersion, data.reason)
      },
    })
  if (can(`${resource}.delete`))
    actions.push({
      key: 'delete',
      label: t('delete'),
      destructive: true,
      eligible: (row) =>
        resource === 'payments'
          ? 'receiptIssuedAt' in row && !row.receiptIssuedAt
          : row.status === 'draft',
      run: (row) =>
        resource === 'payments'
          ? payments.delete(row.id, { expectedVersion: row.version })
          : documents[resource].delete(row.id, row.version),
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
      eligible: (row) => row.status === 'prepared',
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
