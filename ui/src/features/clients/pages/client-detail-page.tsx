import { ArrowLeft, Pencil } from 'lucide-react'
import { Link, useLocation, useParams } from 'wouter'

import { MoreActions } from '../../../components/management/more-actions'
import { PageHeader } from '../../../components/management/page-header'
import { RequestState } from '../../../components/management/request-state'
import { StatusBadge } from '../../../components/management/status-badge'
import { buttonVariants } from '../../../components/ui/button'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { Can } from '../../identity'
import { ClientActions } from '../components/client-actions'
import { ClientNotificationPreferences } from '../components/client-notification-preferences'
import { ClientOverview } from '../components/client-overview'
import { ClientRecentActivity } from '../components/client-recent-activity'
import { ClientRelatedRecords } from '../components/client-related-records'
import { useClient } from '../queries'

function Info({ label, value }: { label: string; value: string | null }) {
  useUiLanguage()

  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        {translate(label)}
      </dt>
      <dd className="mt-1 text-sm font-medium">{value || '—'}</dd>
    </div>
  )
}
export function ClientDetailPage() {
  useUiLanguage()

  const { clientId = '' } = useParams<{ clientId: string }>()
  const [, navigate] = useLocation()
  const query = useClient(clientId)
  if (query.isPending || query.isError)
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={query} />
      </div>
    )
  const client = query.data
  const delivery = client.deliveryAddressLine1
    ? [
        client.deliveryAddressLine1,
        client.deliveryAddressLine2,
        client.deliveryCity,
        client.deliveryPostalCode,
        client.deliveryCountryCode,
      ]
        .filter(Boolean)
        .join(', ')
    : translate('Uses billing address')
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href="/clients"
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={17} />
        {translate('Back to clients')}
      </Link>
      <PageHeader
        eyebrow={
          client.type === 'company' ? translate('Company client') : translate('Individual client')
        }
        title={client.displayName}
        description={`${client.city}, ${client.countryCode} · ${client.email || translate('No email address')}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Can permission="clients.update">
              {!client.archivedAt && (
                <Link href={`/clients/${client.id}/edit`} className={buttonVariants({})}>
                  <Pencil size={16} />
                  {translate('Edit client')}
                </Link>
              )}
            </Can>
            <MoreActions>
              <ClientActions client={client} onDeleted={() => navigate('/clients')} />
            </MoreActions>
          </div>
        }
      />
      <ClientOverview client={client} />
      <div className="grid gap-content lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="grid content-start gap-content">
          <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h2 className="mb-5 text-lg font-bold">{translate('Billing identity')}</h2>
            <dl className="grid gap-content sm:grid-cols-2">
              {client.type === 'individual' ? (
                <>
                  <Info label={translate('First name')} value={client.firstName} />
                  <Info label={translate('Last name')} value={client.lastName} />
                </>
              ) : (
                <>
                  <Info label={translate('Legal name / raison sociale')} value={client.legalName} />
                  <Info label={translate('Trade name')} value={client.tradeName} />
                  <Info label={translate('Contact person')} value={client.contactName} />
                  <Info label={translate('ICE')} value={client.ice} />
                  <Info label={translate('IF')} value={client.taxIdentifier} />
                  <Info label={translate('RC')} value={client.registrationNumber} />
                  <Info label={translate('RC city')} value={client.registrationCity} />
                  <Info label={translate('TP / Patente')} value={client.professionalTaxNumber} />
                </>
              )}
            </dl>
          </section>
          <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h2 className="mb-5 text-lg font-bold">{translate('Addresses')}</h2>
            <dl className="grid gap-content sm:grid-cols-2">
              <Info
                label={translate('Billing')}
                value={[
                  client.addressLine1,
                  client.addressLine2,
                  client.city,
                  client.postalCode,
                  client.countryCode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              />
              <Info label={translate('Delivery')} value={delivery} />
            </dl>
          </section>
        </div>
        <aside className="grid content-start gap-content">
          <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{translate('Contact')}</h2>
              <StatusBadge
                label={client.archivedAt ? translate('Archived') : translate('Active')}
                tone={client.archivedAt ? 'archived' : 'active'}
              />
            </div>
            <dl className="mt-5 grid gap-content">
              <Info label={translate('Email')} value={client.email} />
              <Info label={translate('Phone')} value={client.phone} />
              <Info label={translate('Document language')} value={client.locale} />
            </dl>
            {!client.email && (
              <p className="mt-5 text-sm text-[var(--muted)]">
                {translate('Documents can be downloaded without a client email.')}
              </p>
            )}
          </section>
          {client.notes && (
            <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="mb-3 text-lg font-bold">{translate('Internal notes')}</h2>
              <p className="whitespace-pre-wrap text-sm">{client.notes}</p>
            </section>
          )}
        </aside>
      </div>
      <ClientRelatedRecords clientId={client.id} archived={!!client.archivedAt} />
      <Can permission={['clients.read', 'client_notification_preferences.read']}>
        <ClientNotificationPreferences id={client.id} />
      </Can>
      <ClientRecentActivity clientId={client.id} />
    </div>
  )
}
