import { useState } from 'react'

import { useListAdminEntitlementOverrides } from '../../../../../api/generated/administration/administration'
import type {
  AdminEntitlementOverride,
  AdminOwnerDetail,
} from '../../../../../api/generated/models'
import { type DataColumn, DataTable } from '../../../../../components/management/data-table'
import { RequestState } from '../../../../../components/management/request-state'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Button } from '../../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import {
  effectiveValueLabel,
  entitlementKeys,
  entitlementLabels,
  overrideValueLabel,
} from './entitlement-labels'
import { CreateOverrideDialog, RevokeOverrideDialog } from './override-dialogs'

const states = {
  scheduled: { label: 'Scheduled', tone: 'draft' },
  active: { label: 'Active', tone: 'active' },
  ended: { label: 'Ended', tone: 'archived' },
  revoked: { label: 'Revoked', tone: 'archived' },
} as const

type Dialog = { kind: 'create' } | { kind: 'amend' | 'revoke'; override: AdminEntitlementOverride }

/** Effective values with their origin, and the reviewable override history of one customer. */
export function CustomerOverridesCard({ detail }: { detail: AdminOwnerDetail }) {
  useUiLanguage()
  const ownerId = detail.owner.id
  const query = useListAdminEntitlementOverrides(ownerId, { query: { retry: false } })
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const sources = new Map(
    (detail.subscription.entitlementSources ?? []).map((s) => [s.entitlementKey, s]),
  )
  const effective = entitlementKeys.map((key) => ({ id: key, key, source: sources.get(key) }))
  const columns: DataColumn<AdminEntitlementOverride>[] = [
    {
      title: 'Entitlement',
      render: (o) => (
        <>
          <span className="font-semibold">{translate(entitlementLabels[o.entitlementKey])}</span>
          <p className="text-xs text-[var(--muted)]">{overrideValueLabel(o)}</p>
        </>
      ),
    },
    {
      title: 'Period',
      render: (o) =>
        `${displayDateTime(o.startsAt, o.timezone)} → ${o.endsAt ? displayDateTime(o.endsAt, o.timezone) : translate('Until revoked')}`,
    },
    {
      title: 'Status',
      render: (o) => (
        <>
          <StatusBadge label={states[o.state].label} tone={states[o.state].tone} />
          {o.revokedAt && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {displayDateTime(o.revokedAt, o.timezone)} · {o.revokedBy} · {o.revocationReason}
            </p>
          )}
        </>
      ),
    },
    {
      title: 'Reason (internal)',
      render: (o) => (
        <>
          <p className="text-sm">{o.reason}</p>
          <p className="text-xs text-[var(--muted)]">{o.createdBy}</p>
        </>
      ),
    },
    {
      title: 'Actions',
      align: 'right',
      render: (o) =>
        o.state === 'active' || o.state === 'scheduled' ? (
          <span className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialog({ kind: 'amend', override: o })}
            >
              {translate('Amend')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDialog({ kind: 'revoke', override: o })}
            >
              {translate('Revoke')}
            </Button>
          </span>
        ) : null,
    },
  ]
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>{translate('Plan exceptions')}</CardTitle>
          <Button onClick={() => setDialog({ kind: 'create' })}>{translate('Add override')}</Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section aria-label={translate('Effective limits')}>
          <h3 className="mb-2 text-sm font-semibold">{translate('Effective limits')}</h3>
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {effective.map(({ key, source }) => (
              <div key={key} data-testid={`effective-${key}`}>
                <dt className="text-sm text-[var(--muted)]">{translate(entitlementLabels[key])}</dt>
                <dd className="mt-1 font-semibold">
                  {effectiveValueLabel(key, detail.subscription.entitlements)}{' '}
                  <span className="text-xs font-normal text-[var(--muted)]">
                    {source?.source === 'override'
                      ? source.effectiveUntil
                        ? translate('Override until {{date}}', {
                            date: displayDateTime(source.effectiveUntil),
                          })
                        : translate('Override')
                      : translate('Plan')}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section aria-label={translate('Override history')}>
          <h3 className="mb-2 text-sm font-semibold">{translate('Override history')}</h3>
          {query.isPending || query.isError ? (
            <RequestState query={query} />
          ) : (
            <DataTable
              items={query.data.items}
              columns={columns}
              emptyTitle="No override"
              emptyDescription="This customer uses the plan values."
            />
          )}
        </section>
      </CardContent>
      {dialog?.kind === 'create' && (
        <CreateOverrideDialog ownerId={ownerId} onClose={() => setDialog(null)} />
      )}
      {dialog?.kind === 'amend' && (
        <CreateOverrideDialog
          ownerId={ownerId}
          replaces={dialog.override}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog?.kind === 'revoke' && (
        <RevokeOverrideDialog
          ownerId={ownerId}
          override={dialog.override}
          onClose={() => setDialog(null)}
        />
      )}
    </Card>
  )
}
