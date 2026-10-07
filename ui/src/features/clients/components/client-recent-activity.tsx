import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import { useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { useClientOverview } from '../queries'
const paths = {
  invoice: 'invoices',
  estimate: 'estimates',
  delivery_note: 'delivery-notes',
  payment: 'payments',
}
export function ClientRecentActivity({ clientId }: { clientId: string }) {
  useUiLanguage()

  const { t } = useTranslation('clients')
  const { can } = useAuthorization()
  const enabled = ['invoices.read', 'estimates.read', 'delivery_notes.read', 'payments.read'].some(
    can,
  )
  const query = useClientOverview(clientId, enabled)
  if (!enabled || !query.data) return null
  return (
    <details className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-5">
      <summary className="cursor-pointer font-semibold">{t('activity')}</summary>
      <ul className="mt-4 grid gap-3">
        {query.data.recentActivity.map((item) => (
          <li
            key={`${item.type}-${item.id}`}
            className="flex flex-wrap justify-between gap-2 text-sm"
          >
            <Link
              className="font-medium hover:text-[var(--accent)]"
              href={`/${paths[item.type]}/${item.id}`}
            >
              {t(item.type)} · {item.number ?? t('draft')}
            </Link>
            <span className="text-[var(--muted)]">
              {item.date.slice(0, 10)} ·{' '}
              {t(`statuses.${item.status}`, { defaultValue: item.status })}
            </span>
          </li>
        ))}
      </ul>
      {!query.data.recentActivity.length && (
        <p className="mt-3 text-sm text-[var(--muted)]">{t('noActivity')}</p>
      )}
    </details>
  )
}
