import { useState } from 'react'

export function useTableSelection<T extends { id: string }>(rows: T[], scope: string) {
  const key = `${scope}:${JSON.stringify(rows)}`
  const [selection, setSelection] = useState<{ key: string; ids: string[] }>({ key, ids: [] })
  const ids = selection.key === key ? selection.ids : []
  return {
    ids,
    selected: rows.filter((row) => ids.includes(row.id)),
    all: rows.length > 0 && ids.length === rows.length,
    some: ids.length > 0 && ids.length < rows.length,
    toggle: (id: string, checked: boolean) =>
      setSelection({
        key,
        ids: checked ? [...new Set([...ids, id])] : ids.filter((value) => value !== id),
      }),
    togglePage: (checked: boolean) =>
      setSelection({ key, ids: checked ? rows.map((row) => row.id) : [] }),
    clear: () => setSelection({ key, ids: [] }),
  }
}
