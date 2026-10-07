import '../translations'

import { useTranslation } from 'react-i18next'

import { DateRangePicker } from '../../../components/ui/date-range-picker'
import { Input } from '../../../components/ui/input'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'

export function ClientExtraFilters({
  params,
  filter,
  currency,
  onDateRange,
}: {
  params: URLSearchParams
  filter: (key: string, value: string) => void
  currency?: string
  onDateRange: (from: string, to: string) => void
}) {
  useUiLanguage()

  const { t } = useTranslation('clients')
  const { canAll } = useAuthorization()
  const canActivity = canAll([
    'invoices.read',
    'estimates.read',
    'delivery_notes.read',
    'payments.read',
  ])
  return (
    <>
      <label className="table-filter grid">
        <span className="sr-only">{t('city')}</span>
        <Input
          value={params.get('city') ?? ''}
          placeholder={t('cityPlaceholder')}
          onChange={(e) => filter('city', e.target.value)}
        />
      </label>
      <Can permission={['invoices.read', 'payments.read']}>
        {['balanceMin', 'balanceMax'].map((key) => (
          <label key={key} className="table-filter table-filter-amount grid">
            <span className="sr-only">
              {t(key)}
              {currency ? ` (${currency})` : ''}
            </span>
            <Input
              placeholder={`${t(key)}${currency ? ` (${currency})` : ''}`}
              type="number"
              min="0"
              step="0.01"
              value={params.get(key) ?? ''}
              onChange={(e) => filter(key, e.target.value)}
            />
          </label>
        ))}
      </Can>
      {canActivity && (
        <div className="table-date-range">
          <DateRangePicker
            label={t('activityRange')}
            from={params.get('lastActivityFrom') ?? ''}
            to={params.get('lastActivityTo') ?? ''}
            onChange={onDateRange}
          />
        </div>
      )}
    </>
  )
}
