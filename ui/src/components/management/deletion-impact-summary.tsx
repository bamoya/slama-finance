import { translate } from '../../lib/i18n'

export function DeletionImpactSummary({
  groups,
  media = 0,
  files = 0,
  retainedFiles = 0,
  jobs = 0,
  emails = 0,
}: {
  groups: { resource: string; operation: string; records: { id: string; name: string | null }[] }[]
  media?: number
  files?: number
  retainedFiles?: number
  jobs?: number
  emails?: number
}) {
  const labels: Record<string, string> = {
    products: 'Products',
    categories: 'Categories',
    product_variants: 'Variants',
    clients: 'Clients',
    staff: 'Staff',
    invoices: 'Invoices',
    estimates: 'Estimates',
    delivery_notes: 'Delivery notes',
    payments: 'Payments',
    report_schedules: 'Scheduled reports',
    report_runs: 'Report runs',
    bank_accounts: 'Bank accounts',
    templates: 'Document templates',
    company_settings: 'Company settings',
  }
  return (
    <div className="space-y-3 rounded-lg border border-border p-3 text-sm">
      {groups.map((group) => (
        <section key={`${group.resource}-${group.operation}`}>
          <h3 className="font-semibold">
            {translate(group.operation === 'delete' ? 'Will delete' : 'Will preserve and detach')} ·{' '}
            {translate(labels[group.resource] ?? group.resource)} ({group.records.length})
          </h3>
          <ul className="mt-1 max-h-28 overflow-auto break-words text-muted-foreground">
            {group.records.map((row) => (
              <li key={row.id}>
                {row.name === 'Company default'
                  ? translate('Company default')
                  : (row.name ?? row.id.slice(0, 8))}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!!media && (
        <p>{translate('Images released if unreferenced: {{count}}', { count: media })}</p>
      )}
      {!!files && <p>{translate('Files released: {{count}}', { count: files })}</p>}
      {!!retainedFiles && (
        <p>{translate('Files preserved: {{count}}', { count: retainedFiles })}</p>
      )}
      {!!jobs && <p>{translate('Pending jobs stopped: {{count}}', { count: jobs })}</p>}
      {!!emails && <p>{translate('Email records removed: {{count}}', { count: emails })}</p>}
    </div>
  )
}
