import type { ReactNode } from 'react'

import { translate } from '../../lib/i18n'
import { useUiLanguage } from '../../lib/i18n'
import { EmptyState } from './page-state'
import { SelectionCell, SelectionHeader, type TableSelection } from './selection-cell'

export type DataColumn<T> = {
  title: string
  render: (item: T) => ReactNode
  align?: 'right'
}

export function DataTable<T extends { id: string }>({
  items,
  columns,
  emptyTitle,
  emptyDescription,
  selection,
  selectionName,
}: {
  items: T[]
  columns: readonly DataColumn<T>[]
  emptyTitle: string
  emptyDescription: string
  selection?: TableSelection
  selectionName?: (item: T) => string
}) {
  useUiLanguage()

  if (items.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} />
  return (
    <div className="overflow-x-auto">
      <table data-slot="data-table" className="w-full min-w-[600px] lg:min-w-[900px] text-left">
        <thead className="bg-[var(--surface-muted)] text-xs uppercase text-[var(--muted)]">
          <tr>
            {selection && <SelectionHeader selection={selection} />}
            {columns.map((column) => (
              <th
                key={column.title}
                scope="col"
                className={`px-5 py-3 ${column.align === 'right' ? 'text-right' : ''}`}
              >
                {translate(column.title)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-[var(--surface-hover)]">
              {selection && (
                <SelectionCell
                  selection={selection}
                  id={item.id}
                  name={selectionName?.(item) ?? item.id}
                />
              )}
              {columns.map((column) => (
                <td
                  key={column.title}
                  className={`whitespace-nowrap px-5 py-4 text-sm ${column.align === 'right' ? 'text-right' : ''}`}
                >
                  {column.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
