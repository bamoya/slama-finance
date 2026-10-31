import { useState } from 'react'

import { useListAdminAudit } from '../../../../../api/generated/administration/administration'
import type { AdminAuditEntry } from '../../../../../api/generated/models'
import { type DataColumn, DataTable } from '../../../../../components/management/data-table'
import { DataTablePagination } from '../../../../../components/management/data-table-pagination'
import { RequestState } from '../../../../../components/management/request-state'
import { Button } from '../../../../../components/ui/button'
import { Card } from '../../../../../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../../components/ui/dialog'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import { AuditChangeDiff } from '../components/audit-change-diff'

export function AdminAuditLogPage() {
  useUiLanguage()
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<AdminAuditEntry | null>(null)
  const query = useListAdminAudit({ page }, { query: { retry: false } })
  const columns: DataColumn<AdminAuditEntry>[] = [
    {
      title: 'Date',
      render: (entry) => (
        <span className="whitespace-nowrap">{displayDateTime(entry.createdAt)}</span>
      ),
    },
    { title: 'Actor', render: (entry) => <span className="break-all">{entry.actor}</span> },
    {
      title: 'Action',
      render: (entry) => <span className="font-mono text-xs">{entry.action}</span>,
    },
    {
      title: 'Target',
      render: (entry) => (
        <span className="break-all">
          {entry.targetType}
          {entry.targetId ? ` · ${entry.targetId}` : ''}
        </span>
      ),
    },
    {
      title: 'Details',
      align: 'right',
      render: (entry) =>
        (entry.before !== null || entry.after !== null) && (
          <Button size="sm" variant="outline" onClick={() => setOpen(entry)}>
            {translate('Show changes')}
          </Button>
        ),
    },
  ]
  return (
    <AdministrationLayout title="Audit log">
      <AdministrationPageHeader
        title="Audit log"
        description="Every administrator action, with the data before and after the change."
      />
      <section aria-label={translate('Audit log')}>
        <Card className="gap-0 overflow-hidden p-0">
          {query.isPending || query.isError ? (
            <div className="p-4">
              <RequestState query={query} />
            </div>
          ) : (
            <>
              <DataTable
                items={query.data.items}
                columns={columns}
                emptyTitle={translate('No audit entries yet.')}
                emptyDescription={translate('Administrator actions are recorded here.')}
              />
              <DataTablePagination
                total={query.data.total}
                page={query.data.page}
                pageSize={query.data.pageSize}
                onPage={setPage}
                disabled={query.isFetching}
              />
            </>
          )}
        </Card>
      </section>
      {open && (
        <Dialog open onOpenChange={(next) => !next && setOpen(null)}>
          <DialogContent
            className={`max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl ${document.documentElement.classList.contains('theme-dark') ? 'is-dark' : ''}`}
          >
            <div className="flex flex-col gap-content">
              <DialogTitle>{translate('Changes')}</DialogTitle>
              <DialogDescription className="break-all font-mono">{open.action}</DialogDescription>
              <AuditChangeDiff before={open.before} after={open.after} />
              <div className="flex justify-end">
                <Button type="button" variant="outline" onClick={() => setOpen(null)}>
                  {translate('Close')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AdministrationLayout>
  )
}
