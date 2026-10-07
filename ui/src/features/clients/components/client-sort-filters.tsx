import '../translations'

import { useTranslation } from 'react-i18next'

import { Select, SelectOption } from '../../../components/ui/select'
import { useUiLanguage } from '../../../lib/i18n'
import { Can, useAuthorization } from '../../identity'
export function ClientSortFilters({
  params,
  filter,
  currency,
}: {
  params: URLSearchParams
  filter: (key: string, value: string) => void
  currency?: string
}) {
  useUiLanguage()

  const { t } = useTranslation('clients')
  const { canAll } = useAuthorization()
  const canFinance = canAll(['invoices.read', 'payments.read'])
  const canActivity = canAll([
    'invoices.read',
    'estimates.read',
    'delivery_notes.read',
    'payments.read',
  ])
  const sorts = [
    'displayName',
    'createdAt',
    ...(canFinance ? ['invoiced', 'outstanding'] : []),
    ...(canActivity ? ['lastActivity'] : []),
  ]

  return (
    <>
      {' '}
      <label className="table-filter grid">
        <span className="sr-only">{t('sort')}</span>
        <Select
          value={sorts.includes(params.get('sortBy') ?? '') ? params.get('sortBy')! : 'displayName'}
          onValueChange={(value) => filter('sortBy', value)}
        >
          {sorts.map((key) => (
            <SelectOption key={key} value={key}>
              {t(key)}
              {['invoiced', 'outstanding'].includes(key) && currency ? ` (${currency})` : ''}
            </SelectOption>
          ))}
        </Select>
      </label>
      <label className="table-filter grid">
        <span className="sr-only">{t('order')}</span>
        <Select
          value={params.get('sortOrder') === 'desc' ? 'desc' : 'asc'}
          onValueChange={(value) => filter('sortOrder', value)}
        >
          <SelectOption value="asc">{t('asc')}</SelectOption>
          <SelectOption value="desc">{t('desc')}</SelectOption>
        </Select>
      </label>
      <Can permission={['invoices.read', 'payments.read']}>
        {' '}
        <label className="table-filter grid">
          <span className="sr-only">{t('overdueFilter')}</span>
          <Select
            value={params.get('overdueOnly') === 'true' ? 'true' : 'all'}
            onValueChange={(value) => filter('overdueOnly', value)}
          >
            <SelectOption value="all">{t('allBalances')}</SelectOption>
            <SelectOption value="true">{t('overdueOnly')}</SelectOption>
          </Select>
        </label>
      </Can>
    </>
  )
}
