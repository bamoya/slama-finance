import '../translations'

import { GitBranch, List } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'wouter'

import { DataTablePagination } from '../../../components/management/data-table-pagination'
import { RequestState } from '../../../components/management/request-state'
import { StatusBadge } from '../../../components/management/status-badge'
import { Button } from '../../../components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '../../../components/ui/toggle-group'
import { useUiLanguage } from '../../../lib/i18n'
import { useAuthorization } from '../../identity'
import {
  listDeliveryNotesQuerySchema,
  listEstimatesQuerySchema,
  listInvoicesQuerySchema,
  listPaymentsQuerySchema,
} from '../../sales'
import { useDeliveryNotes, useEstimates, useInvoices, usePayments } from '../../sales'
import type { ActivityFilters } from './activity-tree-model'
import { ClientActivityTree } from './client-activity-tree'
import { ClientDocumentActions } from './client-document-actions'
import { ClientRecordFilters } from './client-record-filters'
import { recordStatusFilters } from './record-status-filters'

const sections = [
  { key: 'estimates', permission: 'estimates.read', path: 'estimates' },
  { key: 'invoices', permission: 'invoices.read', path: 'invoices' },
  { key: 'payments', permission: 'payments.read', path: 'payments' },
  { key: 'delivery_notes', permission: 'delivery_notes.read', path: 'delivery-notes' },
] as const

export function ClientRelatedRecords({
  clientId,
  archived = false,
}: {
  clientId: string
  archived?: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('clients')
  const { can } = useAuthorization()
  const [params, setParams] = useSearchParams()
  const tree = params.get('recordsView') === 'tree'
  const recordFilters: ActivityFilters = {
    search: params.get('recordsSearch') ?? '',
    ...Object.fromEntries(
      recordStatusFilters.map((filter) => [
        filter.key,
        can(`${filter.section}.read`)
          ? (params.get(`records${filter.key[0]!.toUpperCase()}${filter.key.slice(1)}`) ?? '')
          : '',
      ]),
    ),
    from: params.get('recordsFrom') ?? '',
    to: params.get('recordsTo') ?? '',
  }
  const available = sections.filter((section) => can(section.permission))
  const selected =
    available.find((section) => section.key === params.get('records')) ?? available[0]
  const requestedPage = Number(params.get('recordsPage') ?? 1)
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1
  const limit = 10
  const filters = {
    clientId,
    limit,
    offset: (page - 1) * limit,
    search: recordFilters.search || undefined,
    dateFrom: recordFilters.from || undefined,
    dateTo: recordFilters.to || undefined,
  }
  const invoiceStatus = listInvoicesQuerySchema.shape.status.safeParse(
    recordFilters.invoiceStatus || undefined,
  )
  const estimateStatus = listEstimatesQuerySchema.shape.status.safeParse(
    recordFilters.estimateStatus || undefined,
  )
  const deliveryStatus = listDeliveryNotesQuerySchema.shape.status.safeParse(
    recordFilters.deliveryStatus || undefined,
  )
  const paymentStatus = listPaymentsQuerySchema.shape.status.safeParse(
    recordFilters.paymentStatus || undefined,
  )
  const invoices = useInvoices(
    { ...filters, status: invoiceStatus.data },
    !tree && selected?.key === 'invoices' && invoiceStatus.success,
  )
  const estimates = useEstimates(
    { ...filters, status: estimateStatus.data },
    !tree && selected?.key === 'estimates' && estimateStatus.success,
  )
  const deliveries = useDeliveryNotes(
    { ...filters, status: deliveryStatus.data },
    !tree && selected?.key === 'delivery_notes' && deliveryStatus.success,
  )
  const payments = usePayments(
    { ...filters, status: paymentStatus.data },
    !tree && selected?.key === 'payments' && paymentStatus.success,
  )
  if (!selected) return null
  const query = { invoices, estimates, delivery_notes: deliveries, payments }[selected.key]
  const compatible = {
    invoices: invoiceStatus,
    estimates: estimateStatus,
    delivery_notes: deliveryStatus,
    payments: paymentStatus,
  }[selected.key].success
  const changeFilters = (changes: Partial<ActivityFilters>) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.delete('recordsStatus')
        for (const [key, value] of Object.entries(changes)) {
          const param = `records${key[0]!.toUpperCase()}${key.slice(1)}`
          if (value) next.set(param, value)
          else next.delete(param)
        }
        next.delete('recordsPage')
        return next
      },
      { replace: true },
    )
  const change = (key: string, value: string) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set(key, value)
        if (key === 'records') next.delete('recordsPage')
        return next
      },
      { replace: true },
    )
  return (
    <section
      aria-label={t('related')}
      className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5">
        <h2 className="text-lg font-semibold">{t('related')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <ClientDocumentActions clientId={clientId} archived={archived} />
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            value={tree ? 'tree' : 'table'}
            onValueChange={(value) => {
              if (value) change('recordsView', value)
            }}
            aria-label={t('recordView')}
          >
            <ToggleGroupItem value="table">
              <List aria-hidden="true" />
              {t('tableView')}
            </ToggleGroupItem>
            <ToggleGroupItem value="tree">
              <GitBranch aria-hidden="true" />
              {t('treeView')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </div>
      <ClientRecordFilters
        filters={recordFilters}
        onChange={changeFilters}
        sections={tree ? available.map((section) => section.key) : [selected.key]}
      />
      {tree ? (
        <ClientActivityTree clientId={clientId} filters={recordFilters} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] p-5">
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('related')}>
              {available.map((section) => (
                <Button
                  key={section.key}
                  variant={section.key === selected.key ? 'default' : 'outline'}
                  size="md"
                  aria-pressed={section.key === selected.key}
                  onClick={() => change('records', section.key)}
                >
                  {t(section.key)}
                </Button>
              ))}
            </div>
            <Link
              href={`/${selected.path}?clientId=${clientId}`}
              className="text-sm font-semibold hover:text-[var(--accent)]"
            >
              {t('allRecords')}
            </Link>
          </div>
          {!compatible ? (
            <p className="p-panel text-sm text-[var(--muted)]">{t('noRecords')}</p>
          ) : query.isPending || query.isError ? (
            <div className="p-5">
              <RequestState query={query} />
            </div>
          ) : (
            <>
              {!query.data.items.length ? (
                <p className="p-panel text-sm text-[var(--muted)]">{t('noRecords')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table data-slot="data-table" className="w-full min-w-[560px] text-left text-sm">
                    <thead className="bg-[var(--surface-muted)] text-xs uppercase tracking-wide text-[var(--muted)]">
                      <tr>
                        {['number', 'date', 'status', 'amount'].map((key) => (
                          <th className="px-5 py-3" key={key}>
                            {t(key)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {query.data.items.map((item) => (
                        <tr key={item.id} className="hover:bg-[var(--surface-hover)]">
                          <td className="px-5 py-4">
                            <Link
                              className="font-semibold hover:text-[var(--accent)]"
                              href={`/${selected.path}/${item.id}`}
                            >
                              {item.number ?? t('draft')}
                            </Link>
                          </td>
                          <td className="px-5 py-4">
                            {'issueDate' in item
                              ? item.issueDate
                              : 'deliveryDate' in item
                                ? item.deliveryDate
                                : item.paymentDate}
                          </td>
                          <td className="px-5 py-4">
                            <StatusBadge
                              label={t(`statuses.${item.status}`)}
                              tone={
                                ['cancelled', 'superseded'].includes(item.status)
                                  ? 'archived'
                                  : ['draft', 'pending'].includes(item.status)
                                    ? 'draft'
                                    : 'active'
                              }
                            />
                          </td>
                          <td className="px-5 py-4 tabular-nums">
                            {'total' in item
                              ? `${item.total} ${item.currency}`
                              : 'amount' in item
                                ? `${item.amount} ${item.currency}`
                                : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <DataTablePagination
                total={query.data.total}
                page={page}
                pageSize={limit}
                onPage={(page) => change('recordsPage', String(page))}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}
