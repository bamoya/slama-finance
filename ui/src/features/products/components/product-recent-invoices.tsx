import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type { ProductInsightsDetailRecentInvoicesItem } from '../../../api/generated/models'
import { DataTablePagination } from '../../../components/management/data-table-pagination'
import { useUiLanguage } from '../../../lib/i18n'
import { formatCount, formatRevenue, formatWeight } from './catalog-format'

export function ProductRecentInvoices({
  items,
  page,
  total,
  onPage,
}: {
  items: ProductInsightsDetailRecentInvoicesItem[]
  page: number
  total: number
  onPage: (page: number) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('catalog')
  return (
    <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
      <h2 className="p-5 text-lg font-bold">{t('recentInvoices')}</h2>
      {items.length ? (
        <div className="overflow-x-auto">
          <table data-slot="data-table" className="w-full min-w-[600px] text-left text-sm">
            <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3">{t('invoiceNumber')}</th>
                <th className="px-5 py-3">{t('issueDate')}</th>
                <th className="px-5 py-3 text-right">{t('itemUnitsSold')}</th>
                <th className="px-5 py-3 text-right">{t('packageWeightSold')}</th>
                <th className="px-5 py-3 text-right">{t('netRevenue')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-5 py-4">
                    <Link
                      href={`/invoices/${item.id}`}
                      className="font-semibold hover:text-[var(--accent)]"
                    >
                      {item.number}
                    </Link>
                  </td>
                  <td className="px-5 py-4">{item.issueDate}</td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {formatCount(item.quantity)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {formatWeight(item.weightSoldG)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums">
                    {formatRevenue(item.netRevenue, item.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 pb-5 text-sm text-[var(--muted)]">{t('noRecentInvoices')}</p>
      )}
      <DataTablePagination page={page} pageSize={10} total={total} onPage={onPage} />
    </section>
  )
}
