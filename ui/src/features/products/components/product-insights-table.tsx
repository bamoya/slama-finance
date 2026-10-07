import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type { ProductInsightsPageItemsItem } from '../../../api/generated/models'
import {
  SelectionCell,
  SelectionHeader,
  type TableSelection,
} from '../../../components/management/selection-cell'
import { StatusBadge } from '../../../components/management/status-badge'
import { useUiLanguage } from '../../../lib/i18n'
import { formatCount, formatRevenue, formatWeight } from './catalog-format'
import { weightLabel } from './variant-price'

export function ProductInsightsTable({
  items,
  catalogCurrency,
  showFinancial,
  showCategory = true,
  href,
  renderActions,
  selection,
}: {
  items: ProductInsightsPageItemsItem[]
  catalogCurrency: string
  selection?: TableSelection
  showFinancial: boolean
  showCategory?: boolean
  href: (id: string) => string
  renderActions?: (item: ProductInsightsPageItemsItem) => ReactNode
}) {
  useUiLanguage()

  const { t } = useTranslation('catalog')
  return (
    <div className="overflow-x-auto">
      <table data-slot="data-table" className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            {selection && <SelectionHeader selection={selection} />}
            <th className="px-5 py-3">{t('products')}</th>
            {showCategory && <th className="px-5 py-3">{t('category')}</th>}
            <th className="px-5 py-3">{t('variants')}</th>
            <th className="px-5 py-3">{t('pricePerItem')}</th>
            {showFinancial && (
              <>
                <th className="px-5 py-3 text-right">{t('itemUnitsSold')}</th>
                <th className="px-5 py-3 text-right">{t('packageWeightSold')}</th>
                <th className="px-5 py-3 text-right">{t('netRevenue')}</th>
              </>
            )}
            <th className="px-5 py-3">{t('status')}</th>
            {renderActions && <th className="px-5 py-3 text-right">{t('actions')}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {items.map((item) => {
            const product = item.product
            const active = product.variants.filter((variant) => !variant.archivedAt)
            return (
              <tr key={product.id} className="hover:bg-[var(--surface-hover)]">
                {selection && (
                  <SelectionCell selection={selection} id={product.id} name={product.name} />
                )}
                <td className="px-5 py-4">
                  <Link
                    href={href(product.id)}
                    className="font-semibold text-[var(--text)] hover:text-[var(--accent)]"
                  >
                    {product.name}
                  </Link>
                  <p className="mt-1 text-xs text-[var(--muted)]">{product.reference}</p>
                </td>
                {showCategory && (
                  <td className="px-5 py-4">
                    {item.categoryName ??
                      t(product.categoryId ? 'categoryUnavailable' : 'uncategorized')}
                  </td>
                )}
                <td className="px-5 py-4">
                  {active.map((variant) => weightLabel(variant.weightG)).join(' · ') || '—'}
                </td>
                <td className="px-5 py-4">
                  {active
                    .map((variant) => formatRevenue(variant.pricePerItem, catalogCurrency))
                    .join(' · ') || '—'}
                </td>
                {showFinancial && (
                  <>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {item.financial ? formatCount(item.financial.unitsSold) : '—'}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {item.financial ? formatWeight(item.financial.weightSoldG) : '—'}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">
                      {item.financial
                        ? formatRevenue(item.financial.netRevenue, item.financial.currency)
                        : '—'}
                    </td>
                  </>
                )}
                <td className="px-5 py-4">
                  <StatusBadge
                    label={t(product.archivedAt ? 'archived' : 'active')}
                    tone={product.archivedAt ? 'archived' : 'active'}
                  />
                </td>
                {renderActions && (
                  <td className="min-w-[150px] whitespace-nowrap px-5 py-4">
                    {renderActions(item)}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
