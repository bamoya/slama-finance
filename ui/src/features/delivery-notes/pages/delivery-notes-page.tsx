import { PackageCheck, Pencil, Plus, Search, Truck } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'

import { ActionLink } from '../../../components/management/action-link'
import { PageHeader } from '../../../components/management/page-header'
import { StatusBadge } from '../../../components/management/status-badge'
import { buttonVariants } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { deliveryNotes } from '../data/delivery-notes'

export function DeliveryNotesPage() {
  useUiLanguage()

  const [query, setQuery] = useState('')
  const visible = deliveryNotes.filter((note) =>
    `${note.number} ${note.client} ${note.invoice}`.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('Sales')}
        title={translate('Delivery notes')}
        description={translate(
          'Prepare, print and track every bon de livraison linked to a client or invoice.',
        )}
        actions={
          <Link href="/delivery-notes/new" className={buttonVariants({})}>
            <Plus size={17} />
            {translate('New delivery note')}
          </Link>
        }
      />
      <section className="grid gap-3 sm:grid-cols-3">
        <Summary icon={<Truck />} value="2" label={translate('Ready to deliver')} />
        <Summary icon={<PackageCheck />} value="18" label={translate('Delivered this month')} />
        <Summary icon={<PackageCheck />} value="1" label={translate('Awaiting confirmation')} />
      </section>
      <section className="overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)]">
        <div className="relative border-b border-[var(--border)] p-4">
          <Search className="absolute left-7 top-7 text-[var(--muted)]" size={18} />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate('Search delivery notes')}
            className="pl-10"
          />
        </div>
        <div className="overflow-x-auto">
          <table data-slot="data-table" className="w-full min-w-[780px] text-left">
            <thead className="bg-[var(--surface-muted)] text-xs uppercase text-[var(--muted)]">
              <tr>
                <th className="px-5 py-3">{translate('Number')}</th>
                <th className="px-5 py-3">{translate('Client')}</th>
                <th className="px-5 py-3">{translate('Related invoice')}</th>
                <th className="px-5 py-3">{translate('Delivery date')}</th>
                <th className="px-5 py-3">{translate('Items')}</th>
                <th className="px-5 py-3">{translate('Status')}</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {visible.map((note) => (
                <tr key={note.id}>
                  <td className="px-5 py-4">
                    <Link
                      href={`/delivery-notes/${note.id}`}
                      className="font-semibold hover:text-[var(--accent)]"
                    >
                      {note.number}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-sm">{note.client}</td>
                  <td className="px-5 py-4 text-sm text-[var(--accent)]">{note.invoice}</td>
                  <td className="px-5 py-4 text-sm text-[var(--muted)]">{note.date}</td>
                  <td className="px-5 py-4 text-sm">{note.items}</td>
                  <td className="px-5 py-4">
                    <StatusBadge
                      label={note.status}
                      tone={note.status === translate('Delivered') ? 'active' : 'draft'}
                    />
                  </td>
                  <td className="px-5 py-4">
                    <ActionLink href={`/delivery-notes/${note.id}/edit`} label={translate('Edit')}>
                      <Pencil size={16} aria-hidden="true" />
                    </ActionLink>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
function Summary({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  useUiLanguage()

  return (
    <article className="flex items-center gap-4 rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-5">
      <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[var(--accent-soft)] text-[var(--accent)]">
        {icon}
      </span>
      <div>
        <strong className="block text-xl">{value}</strong>
        <span className="text-xs text-[var(--muted)]">{label}</span>
      </div>
    </article>
  )
}
