import '../../translations'

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { EstimateInput } from '../../../../api/generated/schemas/sales/estimates.schemas'
import { Button } from '../../../../components/ui/button'
import { useUiLanguage } from '../../../../lib/i18n'
import { EstimateLineRow } from './estimate-line-row'

type Line = EstimateInput['lines'][number]
export function EstimateLinesEditor({
  lines,
  onChange,
  quantityOnly = false,
}: {
  lines: Line[]
  onChange: (lines: Line[]) => void
  quantityOnly?: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const [keys, setKeys] = useState(() => lines.map(() => crypto.randomUUID()))
  return (
    <section className="grid gap-4 rounded-panel border border-border bg-[var(--surface)] p-5 md:p-panel">
      <div>
        <h2 className="text-lg font-bold">
          {t(quantityOnly ? 'deliveryProducts' : 'lineProducts')}
        </h2>
        {!quantityOnly && <p className="text-sm text-muted-foreground">{t('lineVatHint')}</p>}
      </div>
      <div className="product-editor" data-quantity-only={quantityOnly}>
        {lines.length > 0 && (
          <div className="product-editor-heading" aria-hidden="true">
            <span>#</span>
            <span>{t('lineExisting')}</span>
            <span>{t('lineProductName')}</span>
            <span>{t('lineQuantity')}</span>
            {!quantityOnly && (
              <>
                <span>{t('lineUnitPrice')}</span>
                <span>{t('lineVatRate')}</span>
              </>
            )}
            <span />
          </div>
        )}
        {lines.map((line, index) => (
          <EstimateLineRow
            key={keys[index] ?? index}
            line={line}
            index={index}
            quantityOnly={quantityOnly}
            onChange={(patch) =>
              onChange(
                lines.map((item, current) => (current === index ? { ...item, ...patch } : item)),
              )
            }
            onRemove={() => {
              setKeys((current) => current.filter((_, i) => i !== index))
              onChange(lines.filter((_, i) => i !== index))
            }}
          />
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        className="justify-self-start"
        onClick={() => {
          setKeys((current) => [...current, crypto.randomUUID()])
          onChange([
            ...lines,
            {
              productVariantId: null,
              productName: '',
              quantity: 1,
              unitPrice: '0.00',
              vatRate: null,
            },
          ])
        }}
      >
        <Plus data-icon="inline-start" />
        {t('addProductLine')}
      </Button>
    </section>
  )
}
