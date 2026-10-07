import { SlidersHorizontal, X } from 'lucide-react'
import {
  Children,
  type ComponentProps,
  Fragment,
  isValidElement,
  type ReactNode,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { registerTranslations, useUiLanguage } from '../../lib/i18n'
import { useCompactLayout } from '../../lib/use-compact-layout'
import { cn } from '../../lib/utils'
import { Button } from '../ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../ui/sheet'

registerTranslations('table', {
  moreFilters: 'Filters',
  clearFilters: 'Clear filters',
  done: 'Done',
  filterHint: 'Filters update the list immediately. Close this panel to view the results.',
  activeFilters: 'Active filters',
})

function flatten(nodes: ReactNode): ReactNode[] {
  return Children.toArray(nodes).flatMap((node) =>
    isValidElement<{ children?: ReactNode }>(node) && node.type === Fragment
      ? flatten(node.props.children)
      : [node],
  )
}

/** Mark the persistent search control with table-search. All other controls share one Sheet. */
export function DataTableToolbar({
  className,
  children,
  advanced,
  activeCount,
  onReset,
  separator = true,
  ...props
}: ComponentProps<'div'> & {
  advanced?: ReactNode
  activeCount?: number
  onReset?: () => void
  separator?: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('table')
  const compact = useCompactLayout()
  const [open, setOpen] = useState(false)
  const nodes = flatten(children)
  const search = nodes.filter(
    (node) =>
      isValidElement<{ className?: string }>(node) &&
      node.props.className?.split(' ').includes('table-search'),
  )
  const filters = nodes.filter((node) => !search.includes(node))
  const reset = onReset && (
    <Button type="button" variant="outline" onClick={onReset}>
      <X data-icon="inline-start" />
      {t('clearFilters')}
    </Button>
  )
  return (
    <div
      className={cn('table-filter-shell', separator && 'border-b border-border', className)}
      {...props}
    >
      {!compact ? (
        <>
          <div data-slot="data-table-toolbar" className="data-table-toolbar">
            {children}
            {reset}
          </div>
          {advanced && <div className="table-advanced-fields">{advanced}</div>}
        </>
      ) : (
        <div data-slot="data-table-toolbar" className="data-table-toolbar compact-table-toolbar">
          {search}
          {(filters.length > 0 || advanced) && (
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline">
                  <SlidersHorizontal data-icon="inline-start" />
                  {t('moreFilters')}
                  {!!activeCount && <span className="tabular-nums">({activeCount})</span>}
                  {!activeCount && onReset && (
                    <span
                      aria-label={t('activeFilters')}
                      className="size-2 rounded-full bg-primary"
                    />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="bottom"
                className="responsive-filter-sheet flex max-h-[85dvh] flex-col gap-4 rounded-t-2xl border-border bg-[var(--surface)] text-[var(--text)]"
              >
                <SheetTitle>{t('moreFilters')}</SheetTitle>
                <SheetDescription>{t('filterHint')}</SheetDescription>
                <div className="filter-sheet-fields min-h-0 flex-1 overflow-y-auto">
                  {filters}
                  {advanced}
                </div>
                <div className="flex shrink-0 justify-end gap-2">
                  {reset}
                  <Button type="button" onClick={() => setOpen(false)}>
                    {t('done')}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      )}
    </div>
  )
}
