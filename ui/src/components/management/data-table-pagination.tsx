import { getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { registerTranslations, useUiLanguage } from '../../lib/i18n'
import { Button } from '../ui/button'
import { Select, SelectGroup, SelectOption } from '../ui/select'

registerTranslations('tablePagination', {
  label: 'Table pagination',
  range: '{{from}}–{{to}} of {{total}} records',
  page: 'Page {{page}} of {{pages}}',
  size: 'Rows per page',
  first: 'First page',
  previous: 'Previous',
  next: 'Next',
  last: 'Last page',
})

type Props = {
  total: number
  disabled?: boolean
  onPageSizeChange?: (size: number) => void
} & (
  | { page: number; pageSize: number; onPage: (page: number) => void }
  | { offset: number; limit: number; onOffset: (offset: number) => void }
)

const rows: never[] = []
const columns: never[] = []

/** Shared shadcn Data Table pagination pattern, controlled by server query state.
 * No client row slicing: page and offset APIs are adapted here, not in each module.
 */
export function DataTablePagination(props: Props) {
  useUiLanguage()
  const { t } = useTranslation('tablePagination')
  const pageSize = 'pageSize' in props ? props.pageSize : props.limit
  const pageIndex = 'page' in props ? props.page - 1 : Math.floor(props.offset / pageSize)
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    autoResetPageIndex: false,
    rowCount: props.total,
    state: { pagination: { pageIndex, pageSize } },
    onPaginationChange: (updater) => {
      const next = typeof updater === 'function' ? updater({ pageIndex, pageSize }) : updater
      if ('page' in props) props.onPage(next.pageIndex + 1)
      else props.onOffset(next.pageIndex * pageSize)
    },
  })
  const from = props.total && pageIndex * pageSize < props.total ? pageIndex * pageSize + 1 : 0
  const pages = Math.max(1, table.getPageCount())
  return (
    <nav
      aria-label={t('label')}
      data-slot="table-pagination"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm"
    >
      <span className="text-muted-foreground tabular-nums" aria-live="polite">
        {t('range', {
          from,
          to: from ? Math.min((pageIndex + 1) * pageSize, props.total) : 0,
          total: props.total,
        })}
      </span>
      <div className="flex flex-wrap items-center gap-3">
        {props.onPageSizeChange && (
          <Select
            aria-label={t('size')}
            value={pageSize}
            disabled={props.disabled}
            className="w-20"
            onValueChange={(value) => props.onPageSizeChange?.(Number(value))}
          >
            <SelectGroup>
              {[10, 25, 50].map((size) => (
                <SelectOption key={size} value={size}>
                  {size}
                </SelectOption>
              ))}
            </SelectGroup>
          </Select>
        )}
        <span className="whitespace-nowrap tabular-nums">
          {t('page', { page: pageIndex + 1, pages })}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-md"
            aria-label={t('first')}
            title={t('first')}
            disabled={props.disabled || !table.getCanPreviousPage()}
            onClick={() => table.firstPage()}
          >
            <ChevronsLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-md"
            aria-label={t('previous')}
            title={t('previous')}
            disabled={props.disabled || !table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-md"
            aria-label={t('next')}
            title={t('next')}
            disabled={props.disabled || !table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            <ChevronRight />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-md"
            aria-label={t('last')}
            title={t('last')}
            disabled={props.disabled || !table.getCanNextPage()}
            onClick={() => table.lastPage()}
          >
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </nav>
  )
}
