import { Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { EstimateInput } from '../../../../api/generated/schemas/sales/estimates.schemas'
import { Button } from '../../../../components/ui/button'
import { Combobox } from '../../../../components/ui/combobox'
import { Field, FieldLabel } from '../../../../components/ui/field'
import { Input } from '../../../../components/ui/input'
import { Select, SelectOption } from '../../../../components/ui/select'
import { Switch } from '../../../../components/ui/switch'
import { useUiLanguage } from '../../../../lib/i18n'
import { useProducts } from '../../../products'
type Line = EstimateInput['lines'][number]

export function EstimateLineRow({
  line,
  index,
  onChange,
  onRemove,
  quantityOnly = false,
}: {
  line: Line
  index: number
  onChange: (patch: Partial<Line>) => void
  onRemove: () => void
  quantityOnly?: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const id = useId()
  const [catalog, setCatalog] = useState(!!line.productVariantId || !line.productName)
  const [search, setSearch] = useState('')
  const products = useProducts({ q: search || undefined, status: 'active' })
  const options =
    products.data?.flatMap((product) =>
      product.variants
        .filter((v) => !v.archivedAt)
        .map((v) => ({
          value: v.id,
          label: `${product.name} · ${v.weightG} g`,
          productName: product.name,
          price: v.pricePerItem,
        })),
    ) ?? []
  return (
    <div className="product-editor-row">
      <span
        className="product-editor-number"
        aria-label={t('productLineNumber', { number: index + 1 })}
      >
        {index + 1}
      </span>
      <div className="product-editor-mode">
        <Switch
          id={id + '-mode'}
          checked={catalog}
          title={t(catalog ? 'useExistingProduct' : 'customProductHint')}
          onCheckedChange={(checked) => {
            setCatalog(checked)
            setSearch('')
            onChange({
              productVariantId: null,
              ...(checked ? { productName: '', unitPrice: '0.00' } : {}),
            })
          }}
        />
        <FieldLabel className="sr-only" htmlFor={id + '-mode'}>
          {t('useExistingProduct')}
        </FieldLabel>
        <span className="product-editor-mode-text" aria-hidden="true">
          {t(catalog ? 'lineExisting' : 'manualProduct')}
        </span>
      </div>
      <Field className="product-editor-product">
        <FieldLabel className="product-editor-label" htmlFor={id + '-product'}>
          {t(catalog ? 'existingProduct' : 'lineProductName')}
        </FieldLabel>
        {catalog ? (
          <Combobox
            id={id + '-product'}
            required
            value={line.productVariantId ?? ''}
            onValueChange={(value) => {
              const selected = options.find((option) => option.value === value)
              if (selected)
                onChange({
                  productVariantId: selected.value,
                  productName: selected.productName,
                  unitPrice: selected.price,
                })
            }}
            options={options}
            placeholder={t('chooseProductVariant')}
            selectedLabel={line.productName || undefined}
            search={search}
            onSearchChange={setSearch}
            loading={products.isPending}
            error={products.isError}
            onRetry={() => void products.refetch()}
          />
        ) : (
          <Input
            id={id + '-product'}
            value={line.productName}
            onChange={(e) => onChange({ productName: e.target.value })}
            required
          />
        )}
      </Field>
      <Field>
        <FieldLabel className="product-editor-label" htmlFor={id + '-qty'}>
          {t('lineQuantity')}
        </FieldLabel>
        <Input
          id={id + '-qty'}
          type="number"
          min="1"
          step="1"
          value={line.quantity}
          onChange={(e) => onChange({ quantity: Number(e.target.value) })}
        />
      </Field>
      {!quantityOnly && (
        <>
          <Field>
            <FieldLabel className="product-editor-label" htmlFor={id + '-price'}>
              {t('lineUnitPrice')}
            </FieldLabel>
            <Input
              id={id + '-price'}
              type="number"
              min="0"
              step="0.01"
              value={line.unitPrice}
              onChange={(e) => onChange({ unitPrice: e.target.value })}
            />
          </Field>
          <Field className="product-editor-vat">
            <FieldLabel className="product-editor-label" htmlFor={id + '-vat'}>
              {t('lineVatRate')}
            </FieldLabel>
            <Select
              id={id + '-vat'}
              value={line.vatRate ?? ''}
              onValueChange={(value) => onChange({ vatRate: value || null })}
            >
              <SelectOption value="">{t('lineNoVat')}</SelectOption>
              {['0', '7', '10', '14', '20'].map((rate) => (
                <SelectOption key={rate} value={rate}>
                  {rate}%
                </SelectOption>
              ))}
            </Select>
          </Field>
        </>
      )}
      <div className="product-editor-remove">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label={t('removeProductLine', { number: index + 1 })}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  )
}
