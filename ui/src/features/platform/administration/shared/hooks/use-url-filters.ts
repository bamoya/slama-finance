import { useCallback } from 'react'
import { useLocation, useSearch } from 'wouter'

/** List filters kept in the address bar so views can be linked, reloaded and shared. */
export function useUrlFilters<Key extends string>(keys: readonly Key[]) {
  const search = useSearch()
  const [path, navigate] = useLocation()
  const params = new URLSearchParams(search)
  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ''])) as Record<
    Key,
    string
  >
  const change = useCallback(
    (patch: Partial<Record<Key, string>>) => {
      const next = new URLSearchParams(search)
      let changed = false
      for (const [key, value] of Object.entries(patch) as [Key, string | undefined][]) {
        if ((next.get(key) ?? '') === (value ?? '')) continue
        changed = true
        if (value) next.set(key, value)
        else next.delete(key)
      }
      if (!changed) return
      // Any filter change other than the page itself returns to the first page.
      if (!('page' in patch)) next.delete('page')
      const query = next.toString()
      navigate(query ? `${path}?${query}` : path, { replace: true })
    },
    [navigate, path, search],
  )
  return { values, change }
}
