import { useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'wouter'

import {
  type CompanySettings,
  UpdateCompanySettingsSchema,
} from '../../../../api/generated/schemas/settings/settings.schemas'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { buttonVariants } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../../identity'
import { useAuthorization } from '../../../identity'
import {
  addressFields,
  companyIdentityFields,
  currencyOptions,
} from '../../shared/components/fields'
import { formValues } from '../../shared/components/form-values'
import { SettingsDetails } from '../../shared/components/settings-details'
import { type SettingsField, SettingsForm } from '../../shared/components/settings-form'
import {
  getGetCompanySettingsQueryOptions,
  refreshSettings,
  useCompanySettings,
  useDocumentTemplates,
  useSettingsActions,
} from '../../shared/queries'

export function CompanySettingsPage({ edit = false }: { edit?: boolean }) {
  useUiLanguage()

  const query = useCompanySettings()
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      {edit && (
        <Link href="/settings/company" className="text-sm font-semibold text-[var(--muted)]">
          {translate('← Back to company settings')}
        </Link>
      )}
      <PageHeader
        eyebrow={translate('Administration')}
        title={edit ? translate('Edit company settings') : translate('Company settings')}
        actions={
          <Can permission="company_settings.update">
            {!edit && (
              <Link href="/settings/company/edit" className={buttonVariants({})}>
                <Pencil size={16} aria-hidden="true" />
                {translate('Edit company')}
              </Link>
            )}
          </Can>
        }
        description={translate(
          'Your company identity, contact details and document defaults. Incomplete setup can be saved; it is not a declaration of invoicing compliance.',
        )}
      />
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <CompanyIdentityForm key={edit ? 'edit' : 'view'} record={query.data} edit={edit} />
      )}
    </div>
  )
}

function CompanyIdentityForm({ record, edit }: { record: CompanySettings; edit: boolean }) {
  useUiLanguage()

  const { can: hasAccess } = useAuthorization()

  const settingsApi = useSettingsActions()

  const [, navigate] = useLocation()
  const [snapshot, setSnapshot] = useState(record)
  const templates = useDocumentTemplates(hasAccess('templates.read'))
  const cache = useQueryClient()
  const templateOptions = (templates.data ?? [])
    .filter((item) => !item.archivedAt)
    .map((item) => ({ value: item.id, label: item.name }))
  if (
    snapshot.defaultTemplateId &&
    !templateOptions.some((item) => item.value === snapshot.defaultTemplateId)
  )
    templateOptions.push({
      value: snapshot.defaultTemplateId,
      label: translate('Current template (unavailable)'),
    })
  const fields: SettingsField[] = [
    ...companyIdentityFields,
    ...addressFields,
    {
      name: 'logoAssetId',
      label: translate('Company logo'),
      type: 'logo',
      nullable: true,
      get section() {
        return translate('Brand identity')
      },
    },
    {
      name: 'currency',
      label: translate('Default currency'),
      type: 'select',
      options: currencyOptions,
      get section() {
        return translate('Document defaults')
      },
    },
    {
      name: 'locale',
      label: translate('Document language'),
      type: 'select',
      options: [
        { value: 'fr-MA', label: translate('French (Morocco)') },
        { value: 'ar-MA', label: translate('Arabic (Morocco)') },
        { value: 'en-GB', label: translate('English') },
      ],
    },
    {
      name: 'timezone',
      label: translate('Timezone'),
      type: 'select',
      options: [{ value: 'Africa/Casablanca', label: translate('Africa/Casablanca') }],
    },
    { name: 'paymentDueDays', label: translate('Invoice payment due (days)'), type: 'number' },
    { name: 'estimateValidDays', label: translate('Estimate validity (days)'), type: 'number' },
    {
      name: 'defaultTemplateId',
      label: translate('Default document template'),
      type: 'combobox',
      nullable: true,
      options: templateOptions,
      disabled: !hasAccess('templates.read'),
      loading: templates.isPending,
      error: templates.isError,
      onRetry: () => void templates.refetch(),
    },
  ]
  let sidebar = false
  for (const field of fields) {
    if (field.name === 'logoAssetId') sidebar = true
    if (sidebar) field.column = 'side'
  }
  if (!edit) return <SettingsDetails fields={fields} values={formValues(fields, record)} />
  return (
    <div>
      <p className="mb-6 rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--muted)]">
        {translate(
          'VAT remains optional and off by default. Public document numbers use FAC / DEV / BL / PAY, the year and a random suffix—not a visible running count.',
        )}
      </p>

      <Can permission="templates.read">
        {templates.isError && <RequestState query={templates} />}
      </Can>

      <SettingsForm
        key={snapshot.version}
        fields={fields}
        cancelHref="/settings/company"
        initial={formValues(fields, snapshot)}
        readOnly={!hasAccess('company_settings.update')}
        schema={{
          safeParse: (value) =>
            UpdateCompanySettingsSchema.safeParse({
              ...(value as object),
              expectedVersion: snapshot.version,
            }),
        }}
        onSubmit={async (value) => {
          const result = await settingsApi.saveCompany(UpdateCompanySettingsSchema.parse(value))
          setSnapshot(result)
          await refreshSettings(cache)
          navigate('/settings/company')
        }}
        onReload={async () => {
          setSnapshot(
            await cache.fetchQuery({ ...getGetCompanySettingsQueryOptions(), staleTime: 0 }),
          )
        }}
      />
    </div>
  )
}
