import { useQueryClient } from '@tanstack/react-query'
import { Copy, Pencil } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams, useSearch } from 'wouter'

import {
  type BankAccount,
  CreateBankAccountSchema,
  CreateDocumentTemplateSchema,
  type DocumentTemplate,
  UpdateBankAccountSchema,
  UpdateDocumentTemplateSchema,
} from '../../../../api/generated/schemas/settings/settings.schemas'
import {
  useGetBankAccount,
  useGetDocumentTemplate,
} from '../../../../api/generated/settings/settings'
import { MoreActions } from '../../../../components/management/more-actions'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { buttonVariants } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can, useAuthorization } from '../../../identity'
import { appearanceFields, bankFields } from '../components/fields'
import { formValues } from '../components/form-values'
import { SettingsDetails } from '../components/settings-details'
import { SettingsForm } from '../components/settings-form'
import { SettingsRecordActions } from '../components/settings-record-actions'
import {
  getGetBankAccountQueryOptions,
  getGetDocumentTemplateQueryOptions,
  refreshSettings,
  settingsKeys,
  useSettingsActions,
} from '../queries'

type Resource = 'bank' | 'template'
type Mode = 'new' | 'view' | 'edit'
const templateDefaults = {
  name: '',
  layout: 'classic',
  density: 'standard',
  accentColor: '#ad7d1d',
  showBankDetails: true,
  showSignature: false,
  showPaymentTerms: true,
  logoAssetId: null,
  signatureAssetId: null,
  paymentTerms: null,
  footerText: null,
}

export function SettingsRecordPage({ resource, mode }: { resource: Resource; mode: Mode }) {
  useUiLanguage()

  const { recordId = '' } = useParams<{ recordId: string }>()
  const search = useSearch()
  const copyId =
    resource === 'template' && mode === 'new' ? new URLSearchParams(search).get('copy') : null
  const bankQuery = useGetBankAccount(recordId, {
    query: { enabled: resource === 'bank' && mode !== 'new' && !!recordId },
  })
  const templateQuery = useGetDocumentTemplate(copyId ?? recordId, {
    query: { enabled: resource === 'template' && (!!copyId || (mode !== 'new' && !!recordId)) },
  })
  const query = resource === 'bank' ? bankQuery : templateQuery
  if ((mode !== 'new' || copyId) && (query.isPending || query.isError))
    return (
      <div className="mx-auto grid max-w-[1500px] gap-section p-page">
        <Link
          href={resource === 'bank' ? '/settings/bank-accounts' : '/settings/invoice-appearance'}
        >
          {translate('← Back to list')}
        </Link>
        <RequestState query={query} />
      </div>
    )
  return (
    <RecordContent
      key={`${resource}-${mode}-${recordId}-${copyId ?? ''}`}
      resource={resource}
      mode={mode}
      record={mode === 'new' ? undefined : query.data}
      seed={copyId ? templateQuery.data : undefined}
    />
  )
}

function RecordContent({
  resource,
  mode,
  record,
  seed,
}: {
  resource: Resource
  mode: Mode
  record?: BankAccount | DocumentTemplate
  seed?: DocumentTemplate
}) {
  useUiLanguage()

  const { t } = useTranslation('templates')
  const { can: hasAccess } = useAuthorization()

  const settingsApi = useSettingsActions()

  const [snapshot, setSnapshot] = useState(record)
  const cache = useQueryClient()
  const [, navigate] = useLocation()
  const search = useSearch()
  const preserved = new URLSearchParams(search)
  preserved.delete('copy')
  preserved.delete('layout')
  const suffix = preserved.size ? `?${preserved}` : ''
  const isBank = resource === 'bank'
  const base = isBank ? '/settings/bank-accounts' : '/settings/invoice-appearance'
  const fields = isBank ? bankFields : appearanceFields
  const can = (action: string) => hasAccess(`${isBank ? 'bank_accounts' : 'templates'}.${action}`)
  const canManage = can(mode === 'new' ? 'create' : 'update')
  const current = mode === 'view' ? record : snapshot
  const editable = mode !== 'view' && canManage && !current?.archivedAt
  const listHref = `${base}${suffix}`
  const detailHref = current ? `${base}/${current.id}${suffix}` : listHref
  const requestedLayout = CreateDocumentTemplateSchema.shape.layout.safeParse(
    new URLSearchParams(search).get('layout'),
  )
  const defaults = isBank
    ? { currency: 'MAD' }
    : {
        ...templateDefaults,
        ...(requestedLayout.success ? { layout: requestedLayout.data } : {}),
        ...seed,
        ...(seed ? { name: t('copyName', { name: seed.name }) } : {}),
      }
  const values = formValues(fields, { ...defaults, ...current })
  const noun = translate(isBank ? 'bank account' : 'template')
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={mode === 'edit' ? detailHref : listHref}
        className="text-sm font-semibold text-[var(--muted)]"
      >
        {translate('← Back to')}{' '}
        {mode === 'edit' ? noun : translate(isBank ? 'bank accounts' : 'templates')}
      </Link>
      <PageHeader
        eyebrow={translate('Administration')}
        status={
          current ? (
            <StatusBadge
              label={t(current.archivedAt ? 'archived' : 'active')}
              tone={current.archivedAt ? 'archived' : 'active'}
            />
          ) : undefined
        }
        title={
          mode === 'new'
            ? translate(isBank ? 'Create bank account' : 'Create template')
            : mode === 'edit'
              ? translate(isBank ? 'Edit bank account' : 'Edit template')
              : (current?.name ?? noun)
        }
        description={
          current?.archivedAt
            ? t('archivedDescription')
            : isBank
              ? translate(
                  'Account details for your payment destinations. Keep leading zeros and provide a RIB or IBAN.',
                )
              : translate(
                  'Document appearance, brand assets and sample preview. Existing issued documents retain their original appearance.',
                )
        }
        actions={
          mode === 'view' && current ? (
            <div className="flex flex-wrap gap-2">
              {!isBank && (
                <Can permission="templates.create">
                  <Link
                    href={`${base}/new?copy=${current.id}`}
                    className={buttonVariants({ variant: 'outline' })}
                  >
                    <Copy data-icon="inline-start" />
                    {t('duplicate')}
                  </Link>
                </Can>
              )}
              {!current.archivedAt && (
                <Can permission={`${isBank ? 'bank_accounts' : 'templates'}.update`}>
                  <Link href={`${base}/${current.id}/edit${suffix}`} className={buttonVariants({})}>
                    <Pencil size={16} aria-hidden="true" />
                    {translate(isBank ? 'Edit bank account' : 'Edit template')}
                  </Link>
                </Can>
              )}
              <MoreActions>
                <SettingsRecordActions
                  resource={resource}
                  record={current}
                  onDeleted={() => navigate(listHref)}
                />
              </MoreActions>
            </div>
          ) : undefined
        }
      />
      {editable ? (
        <SettingsForm
          key={snapshot?.version ?? 'new'}
          fields={fields}
          initial={values}
          preview={!isBank}
          cancelHref={mode === 'new' ? listHref : detailHref}
          schema={{
            safeParse: (value) => {
              if (!snapshot)
                return isBank
                  ? CreateBankAccountSchema.safeParse(value)
                  : CreateDocumentTemplateSchema.safeParse(value)
              const input = { ...(value as object), expectedVersion: snapshot.version }
              return isBank
                ? UpdateBankAccountSchema.safeParse(input)
                : UpdateDocumentTemplateSchema.safeParse(input)
            },
          }}
          onSubmit={async (value) => {
            const result = isBank
              ? snapshot
                ? await settingsApi.saveBank(snapshot.id, UpdateBankAccountSchema.parse(value))
                : await settingsApi.createBank(CreateBankAccountSchema.parse(value))
              : snapshot
                ? await settingsApi.saveTemplate(
                    snapshot.id,
                    UpdateDocumentTemplateSchema.parse(value),
                  )
                : await settingsApi.createTemplate(CreateDocumentTemplateSchema.parse(value))
            cache.setQueryData(settingsKeys.detail(resource, result.id), result)
            await refreshSettings(cache)
            navigate(`${base}/${result.id}${suffix}`)
          }}
          onReload={async () => {
            if (snapshot)
              setSnapshot(
                isBank
                  ? await cache.fetchQuery({
                      ...getGetBankAccountQueryOptions(snapshot.id),
                      staleTime: 0,
                    })
                  : await cache.fetchQuery({
                      ...getGetDocumentTemplateQueryOptions(snapshot.id),
                      staleTime: 0,
                    }),
              )
          }}
        />
      ) : (
        <SettingsDetails fields={fields} values={values} preview={!isBank} />
      )}
    </div>
  )
}
import { StatusBadge } from '../../../../components/management/status-badge'
