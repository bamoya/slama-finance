import type { QueryClient } from '@tanstack/react-query'

import * as api from '../../api/generated/catalog/catalog'
import { isLiveReportingPath } from '../reports'
export const getProductForUpdate = api.getProduct

export const useProducts = (params?: Parameters<typeof api.listProducts>[0], enabled = true) =>
  api.useListProducts(params, { query: { enabled } })
export const useProduct = (id: string, enabled = true) =>
  api.useGetProduct(id, { query: { enabled } })
export const useCategories = (params?: Parameters<typeof api.listCategories>[0], enabled = true) =>
  api.useListCategories(params, { query: { enabled } })
export const useCategory = (id: string, enabled = true) =>
  api.useGetCategory(id, { query: { enabled } })
export const useProductInsights = (
  params?: Parameters<typeof api.listProductInsights>[0],
  enabled = true,
) => api.useListProductInsights(params, { query: { enabled } })
export const useProductInsight = (
  id: string,
  params?: Parameters<typeof api.getProductInsights>[1],
  enabled = true,
) => api.useGetProductInsights(id, params, { query: { enabled } })
export const useCategoryInsights = (
  params?: Parameters<typeof api.listCategoryInsights>[0],
  enabled = true,
) => api.useListCategoryInsights(params, { query: { enabled } })
export const useCategoryInsight = (
  id: string,
  params?: Parameters<typeof api.getCategoryInsights>[1],
  enabled = true,
) => api.useGetCategoryInsights(id, params, { query: { enabled } })
export const catalogKeys = {
  products: '/v1/products',
  categories: '/v1/categories',
  product: api.getGetProductQueryKey,
  category: api.getGetCategoryQueryKey,
}
export const refreshCatalog = (client: QueryClient) =>
  client.invalidateQueries({
    predicate: ({ queryKey }) =>
      typeof queryKey[0] === 'string' &&
      (isLiveReportingPath(queryKey[0]) ||
        queryKey[0].startsWith(catalogKeys.products) ||
        queryKey[0].startsWith(catalogKeys.categories)),
  })
export function useCatalogActions() {
  const createProduct = api.useCreateProduct(),
    updateProduct = api.useUpdateProduct()
  const archiveProduct = api.useArchiveProduct(),
    restoreProduct = api.useRestoreProduct(),
    deleteProduct = api.useDeleteProduct()
  const createCategory = api.useCreateCategory(),
    updateCategory = api.useUpdateCategory()
  const archiveCategory = api.useArchiveCategory(),
    restoreCategory = api.useRestoreCategory(),
    deleteCategory = api.useDeleteCategory()
  return {
    createProduct: (data: Parameters<typeof api.createProduct>[0]) =>
      createProduct.mutateAsync({ data }),
    updateProduct: (id: string, data: Parameters<typeof api.updateProduct>[1]) =>
      updateProduct.mutateAsync({ id, data }),
    archiveProduct: (id: string, expectedVersion: number) =>
      archiveProduct.mutateAsync({ id, data: { expectedVersion } }),
    restoreProduct: (id: string, expectedVersion: number) =>
      restoreProduct.mutateAsync({ id, data: { expectedVersion } }),
    deleteProduct: (id: string, expectedVersion: number) =>
      deleteProduct.mutateAsync({ id, data: { expectedVersion } }),
    createCategory: (data: Parameters<typeof api.createCategory>[0]) =>
      createCategory.mutateAsync({ data }),
    updateCategory: (id: string, data: Parameters<typeof api.updateCategory>[1]) =>
      updateCategory.mutateAsync({ id, data }),
    archiveCategory: (id: string, expectedVersion: number) =>
      archiveCategory.mutateAsync({ id, data: { expectedVersion } }),
    restoreCategory: (id: string, expectedVersion: number) =>
      restoreCategory.mutateAsync({ id, data: { expectedVersion } }),
    deleteCategory: (id: string, expectedVersion: number) =>
      deleteCategory.mutateAsync({ id, data: { expectedVersion } }),
  }
}
