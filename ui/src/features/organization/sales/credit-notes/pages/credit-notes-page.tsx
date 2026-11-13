import '../translations'

import { Pencil, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import type {
  CreditNotePageItemsItem,
  ListCreditNotesParams,
} from '../../../../../api/generated/models'
import { ActionLink } from '../../../../../components/management/action-link'
import { DataTablePagination } from '../../../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../../../components/management/data-table-toolbar'
import { PageHeader } from '../../../../../components/management/page-header'
import { RequestState } from '../../../../../components/management/request-state'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Input } from '../../../../../components/ui/input'
import { Select, SelectOption } from '../../../../../components/ui/select'
import { displayDate } from '../../../../../lib/dates'
import { useUiLanguage } from '../../../../../lib/i18n'
import { displayNumber } from '../../../../../lib/number-format'
import { Can } from '../../../identity'
import { DocumentClientLink } from '../../components/document-client-link'
import { type DocumentColumn, DocumentTable } from '../../components/document-table'
import { useDocumentFilters } from '../../components/use-document-filters'
import { CreditNoteKindBadge } from '../components/credit-note-kind-badge'
import { useCreditNotes } from '../queries'

const statusValues = ['draft', 'issued'] as const
const allowed = { status: ['', ...statusValues] }
const pageSize = 25

export function CreditNotesPage() {
  useUiLanguage()

  const { t } = useTranslation('creditNotes')
  const filters = useDocumentFilters(allowed)
  const query = useCreditNotes({
    search: filters.get('search') || undefined,
    status: (filters.get('status') || 'all') as ListCreditNotesParams['status'],
    limit: pageSize,
    offset: (filters.page - 1) * pageSize,
  })
  const columns: DocumentColumn<CreditNotePageItemsItem>[] = [
    {
      title: t('creditNote'),
      render: (row) => (
        <span className="inline-flex flex-wrap items-center gap-2">
          <Link
            href={`/credit-notes/${row.id}`}
            className="font-semibold hover:text-[var(--accent)]"
          >
            {row.number ?? t('draftCreditNote')}
          </Link>
          <CreditNoteKindBadge kind={row.kind} />
        </span>
      ),
    },
    {
      title: t('status'),
      render: (row) => (
        <StatusBadge label={t(row.status)} tone={row.status === 'draft' ? 'draft' : 'active'} />
      ),
    },
    {
      title: t('invoice'),
      render: (row) => (
        <Can permission="invoices.read" fallback={<span>{row.invoiceNumber}</span>}>
          <Link href={`/invoices/${row.invoiceId}`} className="hover:text-[var(--accent)]">
            {row.invoiceNumber}
          </Link>
        </Can>
      ),
    },
    {
      title: t('client'),
      render: (row) => (
        <Can permission="clients.read" fallback={<span>{row.clientDisplayName}</span>}>
          <DocumentClientLink clientId={row.clientId} className="hover:text-[var(--accent)]">
            {row.clientDisplayName}
          </DocumentClientLink>
        </Can>
      ),
    },
    { title: t('issueDate'), render: (row) => displayDate(row.issueDate) },
    {
      title: t('total'),
      align: 'right',
      render: (row) => (
        <strong>
          {displayNumber(row.total)} {row.currency}
        </strong>
      ),
    },
    {
      title: t('actions'),
      align: 'right',
      render: (row) =>
        row.status === 'draft' && (
          <Can permission="credit_notes.update">
            <ActionLink href={`/credit-notes/${row.id}/edit`} label={t('editCreditNote')}>
              <Pencil size={16} />
            </ActionLink>
          </Can>
        ),
    },
  ]
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={t('creditNotes')}
        title={t('creditNotes')}
        description={t('creditNotesDescription')}
      />
      <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
        <DataTableToolbar
          activeCount={filters.get('status') ? 1 : 0}
          onReset={filters.active ? filters.reset : undefined}
        >
          <label className="table-search grid">
            <span className="sr-only">{t('searchCreditNotes')}</span>
            <span className="relative">
              <Search
                size={17}
                className="absolute left-3 top-1/2 text-[var(--muted)]"
                aria-hidden="true"
              />
              <Input
                className="pl-10"
                type="search"
                placeholder={t('searchCreditNotes')}
                value={filters.get('search')}
                onChange={(event) => filters.set('search', event.target.value)}
              />
            </span>
          </label>
          <label className="table-filter grid">
            <span className="sr-only">{t('status')}</span>
            <Select
              value={filters.get('status')}
              onValueChange={(value) => filters.set('status', value)}
            >
              <SelectOption value="">{t('allStatuses')}</SelectOption>
              {statusValues.map((value) => (
                <SelectOption key={value} value={value}>
                  {t(value)}
                </SelectOption>
              ))}
            </Select>
          </label>
        </DataTableToolbar>
        {query.isPending || query.isError ? (
          <div className="p-5">
            <RequestState query={query} />
          </div>
        ) : (
          <DocumentTable
            items={query.data.items}
            columns={columns}
            emptyTitle={t('noCreditNotes')}
            emptyDescription={t('creditNotesDescription')}
          />
        )}
        {query.data && (
          <DataTablePagination
            disabled={query.isFetching}
            page={filters.page}
            pageSize={pageSize}
            total={query.data.total}
            onPage={(value) => filters.set('page', String(value))}
          />
        )}
      </section>
    </div>
  )
}
