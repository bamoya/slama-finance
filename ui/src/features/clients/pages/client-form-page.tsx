import { useForm } from '@tanstack/react-form'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'

import {
  type Client,
  type ClientInput,
  ClientInputSchema,
  ClientUpdateSchema,
} from '../../../api/generated/schemas/clients/clients.schemas'
import { FormActionBar } from '../../../components/management/form-action-bar'
import { FormError } from '../../../components/management/form-error'
import { PageHeader } from '../../../components/management/page-header'
import { RequestState } from '../../../components/management/request-state'
import { Button, buttonVariants } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Select, SelectOption } from '../../../components/ui/select'
import { Switch } from '../../../components/ui/switch'
import { Textarea } from '../../../components/ui/textarea'
import { validationMessage } from '../../../lib/error-messages'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { refreshClients, useClient, useClientActions } from '../queries'

const empty: ClientInput = {
  type: 'company',
  firstName: null,
  lastName: null,
  legalName: null,
  tradeName: null,
  contactName: null,
  email: null,
  phone: null,
  ice: null,
  taxIdentifier: null,
  registrationNumber: null,
  registrationCity: null,
  professionalTaxNumber: null,
  addressLine1: '',
  addressLine2: null,
  city: '',
  postalCode: null,
  countryCode: 'MA',
  deliveryAddressLine1: null,
  deliveryAddressLine2: null,
  deliveryCity: null,
  deliveryPostalCode: null,
  deliveryCountryCode: null,
  locale: 'fr-MA',
  notes: null,
}
const fromClient = (client: Client): ClientInput => ({
  type: client.type,
  firstName: client.firstName,
  lastName: client.lastName,
  legalName: client.legalName,
  tradeName: client.tradeName,
  contactName: client.contactName,
  email: client.email,
  phone: client.phone,
  ice: client.ice,
  taxIdentifier: client.taxIdentifier,
  registrationNumber: client.registrationNumber,
  registrationCity: client.registrationCity,
  professionalTaxNumber: client.professionalTaxNumber,
  addressLine1: client.addressLine1,
  addressLine2: client.addressLine2,
  city: client.city,
  postalCode: client.postalCode,
  countryCode: client.countryCode,
  deliveryAddressLine1: client.deliveryAddressLine1,
  deliveryAddressLine2: client.deliveryAddressLine2,
  deliveryCity: client.deliveryCity,
  deliveryPostalCode: client.deliveryPostalCode,
  deliveryCountryCode: client.deliveryCountryCode,
  locale: client.locale as 'fr-MA' | 'en-GB',
  notes: client.notes,
})

export function ClientFormPage() {
  useUiLanguage()

  const { clientId } = useParams<{ clientId?: string }>()
  const query = useClient(clientId ?? '', Boolean(clientId))
  if (clientId && (query.isPending || query.isError))
    return (
      <div className="mx-auto max-w-[1500px] p-page">
        <RequestState query={query} />
      </div>
    )
  return <ClientEditor key={clientId ?? 'new'} client={clientId ? query.data! : null} />
}

function ClientEditor({ client }: { client: Client | null }) {
  useUiLanguage()

  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const actions = useClientActions()
  const [error, setError] = useState<unknown>()
  const [issues, setIssues] = useState<string[]>([])
  const [separateDelivery, setSeparateDelivery] = useState(Boolean(client?.deliveryAddressLine1))
  const form = useForm({
    defaultValues: client ? fromClient(client) : empty,
    onSubmit: async ({ value }) => {
      setError(undefined)
      const parsed = client
        ? ClientUpdateSchema.safeParse({ ...value, expectedVersion: client.version })
        : ClientInputSchema.safeParse(value)
      if (!parsed.success) {
        setIssues(
          parsed.error.issues.map(
            (issue) => `${issue.path.join('.')}: ${validationMessage(issue.message)}`,
          ),
        )
        return
      }
      setIssues([])
      try {
        const saved = client
          ? await actions.update(
              client.id,
              ClientUpdateSchema.parse({ ...value, expectedVersion: client.version }),
            )
          : await actions.create(ClientInputSchema.parse(value))
        await refreshClients(cache)
        navigate(`/clients/${saved.id}`)
      } catch (cause) {
        setError(cause)
      }
    },
  })
  type TextName = Exclude<
    keyof ClientInput,
    'type' | 'locale' | 'countryCode' | 'deliveryCountryCode'
  >
  const field = (
    name: TextName,
    label: string,
    options?: { required?: boolean; placeholder?: string; type?: string },
  ) => (
    <form.Field key={name} name={name}>
      {(control) => (
        <label className="grid gap-2 text-sm font-medium">
          {translate(label)}
          <Input
            aria-label={translate(label)}
            value={control.state.value ?? ''}
            type={options?.type}
            placeholder={options?.placeholder}
            required={options?.required}
            onBlur={control.handleBlur}
            onChange={(event) =>
              control.handleChange(event.target.value || (options?.required ? '' : null))
            }
          />
        </label>
      )}
    </form.Field>
  )
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={client ? `/clients/${client.id}` : '/clients'}
        className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted)]"
      >
        <ArrowLeft size={16} />
        {translate('Back to clients')}
      </Link>
      <PageHeader
        eyebrow={translate('Relationships')}
        title={
          client
            ? translate('Edit {{value0}}', { value0: client.displayName })
            : translate('Add client')
        }
        description={translate(
          'Billing identity, contact details and Moroccan company identifiers.',
        )}
      />
      <form
        id="client-form-page"
        noValidate
        className="grid gap-section"
        onSubmit={(event) => {
          event.preventDefault()
          if (!form.state.isSubmitting) void form.handleSubmit()
        }}
      >
        <div className="grid gap-section lg:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <div className="grid content-start gap-section">
            <section className="grid gap-content rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="text-lg font-bold">{translate('Identity')}</h2>
              <form.Field name="type">
                {(control) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Client type')}
                    <Select
                      value={control.state.value}
                      onValueChange={(value) => {
                        const next = value as ClientInput['type']
                        control.handleChange(next)
                        if (next === 'individual') {
                          for (const key of [
                            'legalName',
                            'tradeName',
                            'contactName',
                            'ice',
                            'taxIdentifier',
                            'registrationNumber',
                            'registrationCity',
                            'professionalTaxNumber',
                          ] as const)
                            form.setFieldValue(key, null)
                        } else {
                          form.setFieldValue('firstName', null)
                          form.setFieldValue('lastName', null)
                        }
                      }}
                    >
                      <SelectOption value="company">{translate('Company')}</SelectOption>
                      <SelectOption value="individual">{translate('Individual')}</SelectOption>
                    </Select>
                  </label>
                )}
              </form.Field>
              <form.Subscribe selector={(state) => state.values.type}>
                {(type) =>
                  type === 'individual' ? (
                    <div className="grid gap-content sm:grid-cols-2">
                      {field('firstName', 'First name', { required: true })}
                      {field('lastName', 'Last name', { required: true })}
                    </div>
                  ) : (
                    <div className="grid gap-content sm:grid-cols-2">
                      {field('legalName', 'Legal name / raison sociale', { required: true })}
                      {field('tradeName', 'Trade name')}
                      {field('contactName', 'Contact person')}
                      {field('ice', 'ICE', { placeholder: translate('15 digits') })}
                      {field('taxIdentifier', 'IF')}
                      {field('registrationNumber', 'RC number')}
                      {field('registrationCity', 'RC city')}
                      {field('professionalTaxNumber', 'TP / Patente')}
                    </div>
                  )
                }
              </form.Subscribe>
            </section>
            <section className="grid gap-content rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="text-lg font-bold">{translate('Billing address')}</h2>
              <div className="grid gap-content sm:grid-cols-2">
                {field('addressLine1', 'Address line 1', { required: true })}
                {field('addressLine2', 'Address line 2')}
                {field('city', 'City', { required: true })}
                {field('postalCode', 'Postal code')}
                <form.Field name="countryCode">
                  {(control) => (
                    <label className="grid gap-2 text-sm font-medium">
                      {translate('Country code')}
                      <Input
                        aria-label={translate('Country code')}
                        value={control.state.value}
                        maxLength={2}
                        onChange={(event) => control.handleChange(event.target.value.toUpperCase())}
                      />
                    </label>
                  )}
                </form.Field>
              </div>
            </section>
            <section className="grid gap-content rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold">{translate('Separate delivery address')}</h2>
                  <p className="text-sm text-[var(--muted)]">
                    {translate('Leave off to use the complete billing address.')}
                  </p>
                </div>
                <Switch
                  aria-label={translate('Separate delivery address')}
                  checked={separateDelivery}
                  onCheckedChange={(checked) => {
                    setSeparateDelivery(checked)
                    if (!checked)
                      for (const key of [
                        'deliveryAddressLine1',
                        'deliveryAddressLine2',
                        'deliveryCity',
                        'deliveryPostalCode',
                        'deliveryCountryCode',
                      ] as const)
                        form.setFieldValue(key, null)
                    else form.setFieldValue('deliveryCountryCode', 'MA')
                  }}
                />
              </div>
              {separateDelivery && (
                <div className="grid gap-content sm:grid-cols-2">
                  {field('deliveryAddressLine1', 'Delivery address line 1', { required: true })}
                  {field('deliveryAddressLine2', 'Delivery address line 2')}
                  {field('deliveryCity', 'Delivery city', { required: true })}
                  {field('deliveryPostalCode', 'Delivery postal code')}
                  <form.Field name="deliveryCountryCode">
                    {(control) => (
                      <label className="grid gap-2 text-sm font-medium">
                        {translate('Delivery country code')}
                        <Input
                          aria-label={translate('Delivery country code')}
                          value={control.state.value ?? ''}
                          maxLength={2}
                          onChange={(event) =>
                            control.handleChange(event.target.value.toUpperCase() || null)
                          }
                        />
                      </label>
                    )}
                  </form.Field>
                </div>
              )}
            </section>
          </div>
          <aside className="grid content-start gap-section">
            <section className="grid gap-content rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="text-lg font-bold">{translate('Contact and language')}</h2>
              {field('email', 'Email address', { type: 'email' })}
              {field('phone', 'Phone', { type: 'tel', placeholder: '+212 …' })}
              <form.Field name="locale">
                {(control) => (
                  <label className="grid gap-2 text-sm font-medium">
                    {translate('Document language')}
                    <Select
                      value={control.state.value}
                      onValueChange={(value) =>
                        control.handleChange(value as ClientInput['locale'])
                      }
                    >
                      <SelectOption value="fr-MA">{translate('French (Morocco)')}</SelectOption>
                      <SelectOption value="en-GB">{translate('English')}</SelectOption>
                    </Select>
                  </label>
                )}
              </form.Field>
              <p className="text-sm text-[var(--muted)]">
                {translate(
                  'Email is optional. Document delivery preferences will be configured later.',
                )}
              </p>
            </section>
            <section className="grid gap-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
              <h2 className="text-lg font-bold">{translate('Internal notes')}</h2>
              <form.Field name="notes">
                {(control) => (
                  <Textarea
                    aria-label={translate('Internal notes')}
                    className="min-h-32"
                    maxLength={4000}
                    value={control.state.value ?? ''}
                    onChange={(event) => control.handleChange(event.target.value || null)}
                  />
                )}
              </form.Field>
            </section>
          </aside>
        </div>
        {issues.length > 0 && (
          <div
            role="alert"
            className="rounded-2xl border border-[var(--error-border)] bg-[var(--error-bg)] p-4 text-sm text-[var(--error-text)]"
          >
            {issues.map((issue) => (
              <p key={issue}>{issue}</p>
            ))}
          </div>
        )}
        <FormError error={error} />
        <FormActionBar>
          <Link
            href={client ? `/clients/${client.id}` : '/clients'}
            className={buttonVariants({ variant: 'outline' })}
          >
            {translate('Cancel')}
          </Link>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(pending) => (
              <Button type="submit" form="client-form-page" disabled={pending}>
                <Save size={16} />
                {pending
                  ? translate('Saving…')
                  : client
                    ? translate('Save changes')
                    : translate('Create client')}
              </Button>
            )}
          </form.Subscribe>
        </FormActionBar>
      </form>
    </div>
  )
}
