import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Combobox } from '../../../components/ui/combobox'
import { useUiLanguage } from '../../../lib/i18n'
import { useClient, useClients } from '../../clients'

export function ClientPicker({
  value,
  onValueChange,
  activeOnly = true,
  enabled = true,
  clearLabel,
  selectedLabel,
  id,
}: {
  value: string
  onValueChange: (value: string) => void
  activeOnly?: boolean
  enabled?: boolean
  clearLabel?: string
  selectedLabel?: string
  id?: string
}) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const [search, setSearch] = useState('')
  const clients = useClients(
    { q: search || undefined, status: activeOnly ? 'active' : undefined, limit: 100 },
    enabled,
  )
  const selected = useClient(value, enabled && z.string().uuid().safeParse(value).success)
  return (
    <Combobox
      id={id}
      aria-label={t('client')}
      value={value}
      onValueChange={onValueChange}
      options={
        clients.data?.items.map((client) => ({
          value: client.id,
          label: client.displayName,
        })) ?? []
      }
      placeholder={t('selectClient')}
      clearLabel={clearLabel}
      selectedLabel={selected.data?.displayName ?? selectedLabel}
      search={search}
      onSearchChange={setSearch}
      loading={clients.isPending && enabled}
      error={clients.isError}
      onRetry={() => void clients.refetch()}
      disabled={!enabled}
    />
  )
}
