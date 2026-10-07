import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Combobox } from '../../../components/ui/combobox'
import { useUiLanguage } from '../../../lib/i18n'
import { useInvoice, useInvoices } from '../invoices/queries'

export function SourceInvoicePicker({
  clientId,
  value,
  onValueChange,
  selectedLabel,
}: {
  clientId: string
  value: string | null
  onValueChange: (value: string | null) => void
  selectedLabel?: string
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const [search, setSearch] = useState('')
  const invoices = useInvoices(
    { clientId: clientId || undefined, search: search || undefined, limit: 100 },
    Boolean(clientId),
  )
  const selected = useInvoice(value ?? '', z.string().uuid().safeParse(value).success)
  return (
    <Combobox
      aria-label={t('sourceInvoice')}
      value={value ?? ''}
      onValueChange={(next) => onValueChange(next || null)}
      options={
        invoices.data?.items
          .filter((invoice) => ['issued', 'sent'].includes(invoice.status))
          .map((invoice) => ({
            value: invoice.id,
            label: invoice.number ?? t('draftInvoice'),
            keywords: [invoice.clientDisplayName],
          })) ?? []
      }
      placeholder={t('sourceInvoice')}
      clearLabel={t('independentDelivery')}
      selectedLabel={selected.data?.number ?? selectedLabel}
      search={search}
      onSearchChange={setSearch}
      loading={invoices.isPending && Boolean(clientId)}
      error={invoices.isError}
      onRetry={() => void invoices.refetch()}
      disabled={!clientId}
    />
  )
}
