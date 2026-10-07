import { useTranslation } from 'react-i18next'

import type { ProductInsightsDetailVariantsItem } from '../../../api/generated/models'
import { StatusBadge } from '../../../components/management/status-badge'
import { useUiLanguage } from '../../../lib/i18n'
import { formatCount, formatRevenue, formatWeight } from './catalog-format'

export function ProductVariantInsights({
  items,
  catalogCurrency,
  showFinancial,
}: {
  items: ProductInsightsDetailVariantsItem[]
  catalogCurrency: string
  showFinancial: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('catalog')
  return (
    <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
      <h2 className="p-5 text-lg font-bold">{t('variants')}</h2>
      <div className="overflow-x-auto">
        <table data-slot="data-table" className="w-full min-w-[600px] text-left text-sm">
          <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--muted)]">
            <tr>
              <th className="px-5 py-3">{t('packageWeight')}</th>
              <th className="px-5 py-3">{t('pricePerItem')}</th>
              {showFinancial && (
                <>
                  <th className="px-5 py-3 text-right">{t('itemUnitsSold')}</th>
                  <th className="px-5 py-3 text-right">{t('packageWeightSold')}</th>
                  <th className="px-5 py-3 text-right">{t('netRevenue')}</th>
                </>
              )}
              <th className="px-5 py-3">{t('status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {items.map(({ variant, financial }) => (
              <tr key={variant.id}>
                <td className="px-5 py-4 font-semibold">{formatWeight(variant.weightG)}</td>
                <td className="px-5 py-4">
                  {formatRevenue(variant.pricePerItem, catalogCurrency)}
                </td>
                {showFinancial && (
                  <>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {financial ? formatCount(financial.unitsSold) : '—'}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {financial ? formatWeight(financial.weightSoldG) : '—'}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {financial ? formatRevenue(financial.netRevenue, financial.currency) : '—'}
                    </td>
                  </>
                )}
                <td className="px-5 py-4">
                  <StatusBadge
                    label={t(variant.archivedAt ? 'archived' : 'active')}
                    tone={variant.archivedAt ? 'archived' : 'active'}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-[var(--border)] p-5 text-sm text-[var(--muted)]">
        {t('variantPriceNote')}
      </p>
    </section>
  )
}
