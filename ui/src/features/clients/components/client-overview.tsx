import '../translations'

import { useTranslation } from 'react-i18next'

import type { Client } from '../../../api/generated/schemas/clients/clients.schemas'
import { RequestState } from '../../../components/management/request-state'
import { StatsGrid } from '../../../components/management/stats-grid'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
import { useClientOverview } from '../queries'

export function ClientOverview({ client }: { client: Client }) {
  useUiLanguage()

  const { t } = useTranslation('clients')
  const { can } = useAuthorization()
  const enabled = ['invoices.read', 'estimates.read', 'delivery_notes.read', 'payments.read'].some(
    can,
  )
  const query = useClientOverview(client.id, enabled)
  if (!enabled) return null
  return (
    <section aria-label={t('overview')} className="grid gap-content">
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <>
          <Can permission={['invoices.read', 'payments.read']}>
            {query.data.financialSummary && (
              <div className="grid gap-3">
                {query.data.financialSummary.currencies.length === 0 && (
                  <p className="text-sm text-[var(--muted)]">{t('noFinance')}</p>
                )}
                {query.data.financialSummary.currencies.map((summary) => (
                  <StatsGrid
                    key={summary.currency}
                    items={(['invoiced', 'received', 'outstanding', 'overdue'] as const).map(
                      (key) => ({
                        label: t(key),
                        value: summary[`${key}Amount`],
                        detail: summary.currency,
                      }),
                    )}
                  />
                ))}
                <p className="text-xs text-[var(--muted)]">{t('financeHint')}</p>
              </div>
            )}
          </Can>
        </>
      )}
    </section>
  )
}
