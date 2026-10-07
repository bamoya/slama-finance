import '../../translations'

import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { DeliveryNoteInput } from '../../../../api/generated/schemas/sales/delivery-notes.schemas'
import { Button } from '../../../../components/ui/button'
import { Combobox } from '../../../../components/ui/combobox'
import { Input } from '../../../../components/ui/input'
import { useUiLanguage } from '../../../../lib/i18n'
import { EstimateLinesEditor } from '../../estimates/components/estimate-lines-editor'
import { useInvoice } from '../../invoices/queries'

type Line = DeliveryNoteInput['lines'][number]
export function DeliveryLinesEditor({
  invoiceId,
  lines,
  onChange,
}: {
  invoiceId: string | null
  lines: Line[]
  onChange: (lines: Line[]) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const invoice = useInvoice(invoiceId ?? '', Boolean(invoiceId))
  if (!invoiceId)
    return (
      <EstimateLinesEditor
        quantityOnly
        lines={lines.map((line) => ({
          productVariantId: line.productVariantId,
          productName: line.productName,
          quantity: line.quantity,
          unitPrice: '0.00',
          vatRate: null,
        }))}
        onChange={(next) =>
          onChange(
            next.map((line) => ({
              productVariantId: line.productVariantId,
              productName: line.productName,
              quantity: line.quantity,
              sourceInvoiceLineId: null,
            })),
          )
        }
      />
    )
  const change = (index: number, patch: Partial<Line>) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  return (
    <section className="grid gap-4 rounded-panel border border-border bg-[var(--surface)] p-5 md:p-panel">
      <h2 className="text-lg font-bold">{t('deliveryProducts')}</h2>
      <div className="product-editor" data-invoice-lines>
        {lines.length > 0 && (
          <div className="product-editor-heading" aria-hidden="true">
            <span>#</span>
            <span>{t('selectInvoiceLine')}</span>
            <span>{t('lineQuantity')}</span>
            <span />
          </div>
        )}
        {lines.map((line, index) => (
          <div className="product-editor-row" key={index}>
            <span className="product-editor-number">{index + 1}</span>
            <div className="delivery-source-product">
              <Combobox
                aria-label={t('selectInvoiceLine')}
                value={line.sourceInvoiceLineId ?? ''}
                onValueChange={(value) => {
                  const source = invoice.data?.lines.find((item) => item.id === value)
                  if (source)
                    change(index, {
                      sourceInvoiceLineId: source.id,
                      productVariantId: source.productVariantId,
                      productName: source.productName,
                    })
                }}
                options={
                  invoice.data?.lines.map((item) => ({
                    value: item.id,
                    label: `${item.productName} · ${item.packageWeightG ?? '—'} g · ${t('orderedQuantity', { quantity: item.quantity })}`,
                    keywords: [item.productReference ?? ''],
                  })) ?? []
                }
                placeholder={t('selectInvoiceLine')}
                selectedLabel={line.productName}
                loading={invoice.isPending}
                error={invoice.isError}
                onRetry={() => void invoice.refetch()}
              />
            </div>
            <Input
              aria-label={t('lineQuantity')}
              type="number"
              min="1"
              step="1"
              value={line.quantity}
              onChange={(e) => change(index, { quantity: Number(e.target.value) })}
            />
            <div className="product-editor-remove">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={t('removeProductLine', { number: index + 1 })}
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
              >
                <Trash2 />
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        onClick={() =>
          onChange([
            ...lines,
            { sourceInvoiceLineId: null, productVariantId: null, productName: '', quantity: 1 },
          ])
        }
      >
        <Plus data-icon="inline-start" />
        {t('addProductLine')}
      </Button>
    </section>
  )
}
