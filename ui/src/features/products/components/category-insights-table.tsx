import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type { CategoryInsightsPageItemsItem } from '../../../api/generated/models'
import {
  SelectionCell,
  SelectionHeader,
  type TableSelection,
} from '../../../components/management/selection-cell'
import { StatusBadge } from '../../../components/management/status-badge'
import { useUiLanguage } from '../../../lib/i18n'
import { formatCount, formatRevenue, formatWeight } from './catalog-format'

export function CategoryInsightsTable({
  items,
  showFinancial,
  href,
  renderActions,
  selection,
}: {
  items: CategoryInsightsPageItemsItem[]
  selection?: TableSelection
  showFinancial: boolean
  href: (id: string) => string
  renderActions?: (item: CategoryInsightsPageItemsItem) => ReactNode
}) {
  useUiLanguage()

  const { t } = useTranslation('catalog')
  return (
    <div className="overflow-x-auto">
      <table data-slot="data-table" className="w-full min-w-[750px] text-left text-sm">
        <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--muted)]">
          <tr>
            {selection && <SelectionHeader selection={selection} />}
            <th className="px-5 py-3">{t('name')}</th>
            <th className="px-5 py-3">{t('description')}</th>
            <th className="px-5 py-3 text-right">{t('productsCount')}</th>
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
          {items.map((item) => (
            <tr key={item.category.id} className="hover:bg-[var(--surface-hover)]">
              {selection && (
                <SelectionCell
                  selection={selection}
                  id={item.category.id}
                  name={item.category.name}
                />
              )}
              <td className="px-5 py-4">
                <Link
                  href={href(item.category.id)}
                  className="font-semibold text-[var(--text)] hover:text-[var(--accent)]"
                >
                  {item.category.name}
                </Link>
              </td>
              <td className="px-5 py-4 text-[var(--muted)]">{item.category.description || '—'}</td>
              <td className="px-5 py-4 text-right tabular-nums">
                {formatCount(item.productCount)}
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
                  label={t(item.category.archivedAt ? 'archived' : 'active')}
                  tone={item.category.archivedAt ? 'archived' : 'active'}
                />
              </td>
              {renderActions && (
                <td className="min-w-[150px] whitespace-nowrap px-5 py-4">{renderActions(item)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
