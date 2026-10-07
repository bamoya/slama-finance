import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ProductUpdateSchema } from '../../../api/generated/schemas/catalog/catalog.schemas'
import { type BulkAction, BulkActions } from '../../../components/management/bulk-actions'
import { Combobox } from '../../../components/ui/combobox'
import { ApiError } from '../../../lib/api-error'
import { useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import { getProductForUpdate, refreshCatalog, useCatalogActions, useCategories } from '../queries'

type Record = { id: string; name: string; version: number; archivedAt: string | null }
export function CatalogBulkActions({
  resource,
  selected,
  clear,
}: {
  resource: 'products' | 'categories'
  selected: Record[]
  clear: () => void
}) {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  const { can } = useAuthorization()
  const api = useCatalogActions()
  const cache = useQueryClient()
  const product = resource === 'products'
  const [category, setCategory] = useState('')
  const [search, setSearch] = useState('')
  const categories = useCategories(
    { status: 'active', q: search || undefined },
    product && can('products.update') && can('categories.read') && selected.length > 0,
  )
  const actions: BulkAction<Record>[] = [
    {
      key: 'archive',
      label: t('archive'),
      eligible: (row) => !row.archivedAt,
      run: (row) => (product ? api.archiveProduct : api.archiveCategory)(row.id, row.version),
    },
    {
      key: 'restore',
      label: t('restore'),
      eligible: (row) => !!row.archivedAt,
      run: (row) => (product ? api.restoreProduct : api.restoreCategory)(row.id, row.version),
    },
    {
      key: 'delete',
      label: t('delete'),
      destructive: true,
      run: (row) => (product ? api.deleteProduct : api.deleteCategory)(row.id, row.version),
    },
  ]
  if (product && can('categories.read'))
    actions.unshift({
      key: 'update',
      label: t('category'),
      eligible: (row) => !row.archivedAt,
      disabled: !category,
      content: (
        <Combobox
          aria-label={t('categoryPlaceholder')}
          placeholder={t('categoryPlaceholder')}
          value={category}
          onValueChange={setCategory}
          search={search}
          onSearchChange={setSearch}
          loading={categories.isFetching}
          error={categories.isError}
          onRetry={() => void categories.refetch()}
          options={[
            { value: '__none__', label: t('uncategorized') },
            ...(categories.data ?? []).map((row) => ({ value: row.id, label: row.name })),
          ]}
        />
      ),
      run: async (row) => {
        const current = await getProductForUpdate(row.id)
        if (current.version !== row.version)
          throw new ApiError(409, 'VERSION_CONFLICT', t('changed'))
        return api.updateProduct(
          row.id,
          ProductUpdateSchema.parse({
            reference: current.reference,
            name: current.name,
            description: current.description,
            categoryId: category === '__none__' ? null : category,
            imageAssetId: current.imageAssetId,
            suggestedVatRate: current.suggestedVatRate,
            expectedVersion: row.version,
            variants: current.variants.map((variant) => ({
              id: variant.id,
              weightG: variant.weightG,
              pricePerItem: variant.pricePerItem,
              costPerItem: variant.costPerItem,
              active: !variant.archivedAt,
            })),
          }),
        )
      },
    })
  return (
    <BulkActions
      selected={selected}
      actions={actions.filter((action) =>
        can(`${resource}.${action.key === 'delete' ? 'delete' : 'update'}`),
      )}
      name={(row) => row.name}
      clear={clear}
      refresh={() => refreshCatalog(cache)}
    />
  )
}
