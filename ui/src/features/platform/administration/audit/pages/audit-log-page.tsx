import { Fragment, useState } from 'react'

import { useListAdminAudit } from '../../../../../api/generated/administration/administration'
import { DataTablePagination } from '../../../../../components/management/data-table-pagination'
import { RequestState } from '../../../../../components/management/request-state'
import { Button } from '../../../../../components/ui/button'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { ScrollingTable } from '../../shared/components/scrolling-table'

export function AdminAuditLogPage() {
  useUiLanguage()
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<string | null>(null)
  const query = useListAdminAudit({ page }, { query: { retry: false } })
  return (
    <AdministrationLayout title="Audit log">
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <section aria-label={translate('Audit log')} className="space-y-4">
          <ScrollingTable>
            <thead>
              <tr>
                <th>{translate('Date')}</th>
                <th>{translate('Actor')}</th>
                <th>{translate('Action')}</th>
                <th>{translate('Target')}</th>
                <th>
                  <span className="sr-only">{translate('Details')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {!query.data.items.length && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-[var(--muted)]">
                    {translate('No audit entries yet.')}
                  </td>
                </tr>
              )}
              {query.data.items.map((entry) => {
                const expanded = open === entry.id
                const detail = entry.before !== null || entry.after !== null
                return (
                  <Fragment key={entry.id}>
                    <tr className="border-t border-[var(--border)]">
                      <td className="whitespace-nowrap">{displayDateTime(entry.createdAt)}</td>
                      <td className="break-all">{entry.actor}</td>
                      <td className="font-mono text-xs">{entry.action}</td>
                      <td className="break-all">
                        {entry.targetType}
                        {entry.targetId ? ` · ${entry.targetId}` : ''}
                      </td>
                      <td className="text-right">
                        {detail && (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-expanded={expanded}
                            onClick={() => setOpen(expanded ? null : entry.id)}
                          >
                            {translate(expanded ? 'Hide changes' : 'Show changes')}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={5}>
                          <div className="grid gap-3 md:grid-cols-2">
                            {(
                              [
                                ['Before', entry.before],
                                ['After', entry.after],
                              ] as const
                            ).map(([label, value]) => (
                              <div key={label}>
                                <h3 className="mb-1 text-xs font-semibold uppercase text-[var(--muted)]">
                                  {translate(label)}
                                </h3>
                                <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--accent-soft)] p-3 text-xs">
                                  {value === null ? '—' : JSON.stringify(value, null, 2)}
                                </pre>
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </ScrollingTable>
          <DataTablePagination
            total={query.data.total}
            page={query.data.page}
            pageSize={query.data.pageSize}
            onPage={setPage}
          />
        </section>
      )}
    </AdministrationLayout>
  )
}
