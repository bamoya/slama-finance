import { useState } from 'react'

import {
  useCreateAdminEntitlementOverride,
  useRevokeAdminEntitlementOverride,
} from '../../../../../api/generated/administration/administration'
import type { AdminEntitlementOverride, EntitlementKey } from '../../../../../api/generated/models'
import { Checkbox } from '../../../../../components/ui/checkbox'
import { DateInput } from '../../../../../components/ui/date-input'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { Select, SelectGroup, SelectOption } from '../../../../../components/ui/select'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { useRefreshAdministration } from '../hooks/use-refresh-administration'
import { CustomerActionDialog } from './customer-action-dialog'
import {
  allowsUnlimited,
  entitlementKeys,
  entitlementLabels,
  isLimit,
  overrideValueLabel,
} from './entitlement-labels'

export function CreateOverrideDialog({
  ownerId,
  replaces,
  onClose,
}: {
  ownerId: string
  /** Amendment: the replaced record is revoked in the same request. */
  replaces?: AdminEntitlementOverride
  onClose: () => void
}) {
  useUiLanguage()
  const create = useCreateAdminEntitlementOverride()
  const refresh = useRefreshAdministration()
  const [key, setKey] = useState<EntitlementKey>(replaces?.entitlementKey ?? 'staffPerOrganization')
  const [enabled, setEnabled] = useState(replaces?.booleanValue ?? true)
  const [unlimited, setUnlimited] = useState(replaces?.unlimited ?? false)
  const [amount, setAmount] = useState(
    replaces?.integerValue === null || replaces?.integerValue === undefined
      ? ''
      : String(
          replaces.entitlementKey === 'storageBytes'
            ? replaces.integerValue / 1e9
            : replaces.integerValue,
        ),
  )
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const limit = isLimit(key)
  const storage = key === 'storageBytes'
  const parsed = storage ? Math.round(Number(amount) * 1e9) : Number(amount)
  const min = key === 'organizations' ? 1 : 0
  const valueValid =
    !limit || unlimited || (amount.trim() !== '' && Number.isSafeInteger(parsed) && parsed >= min)
  const windowValid = !end || !start || end > start
  return (
    <CustomerActionDialog
      title={translate(replaces ? 'Amend override' : 'Add override')}
      description={translate(
        'Replaces one plan value for this customer subscription. Other customers are not affected.',
      )}
      impacts={[
        translate('Applies to all organizations of this customer; storage and emails stay pooled.'),
        translate('Suspension, expiry and organization restrictions still apply.'),
        translate('Existing usage is kept; lower limits only block new actions.'),
        ...(replaces
          ? [
              translate('The current override ({{value}}) is revoked and kept in history.', {
                value: overrideValueLabel(replaces),
              }),
            ]
          : []),
      ]}
      submitLabel={translate(replaces ? 'Amend override' : 'Add override')}
      fieldsReady={valueValid && windowValid}
      fields={
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="override-key">{translate('Entitlement')}</Label>
            <Select
              id="override-key"
              aria-label={translate('Entitlement')}
              value={key}
              disabled={Boolean(replaces)}
              onValueChange={(value) => {
                setKey(value as EntitlementKey)
                setUnlimited(false)
              }}
            >
              <SelectGroup>
                {entitlementKeys.map((item) => (
                  <SelectOption key={item} value={item}>
                    {translate(entitlementLabels[item])}
                  </SelectOption>
                ))}
              </SelectGroup>
            </Select>
          </div>
          {limit ? (
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="override-value">
                {translate(storage ? 'New limit (GB)' : 'New limit')}
              </Label>
              <Input
                id="override-value"
                inputMode="numeric"
                value={amount}
                disabled={unlimited}
                aria-invalid={!valueValid}
                onChange={(event) => setAmount(event.target.value)}
              />
              {!valueValid && (
                <p role="alert" className="text-sm text-[var(--error-text)]">
                  {translate('Enter a whole number of at least {{min}}.', { min })}
                </p>
              )}
              {allowsUnlimited(key) && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={unlimited}
                    onCheckedChange={(checked) => setUnlimited(checked === true)}
                  />
                  {translate('Unlimited')}
                </label>
              )}
            </div>
          ) : (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <Checkbox
                checked={enabled}
                onCheckedChange={(checked) => setEnabled(checked === true)}
              />
              {translate('Feature enabled')}
            </label>
          )}
          <div className="space-y-2">
            <Label htmlFor="override-start">{translate('Starts')}</Label>
            <DateInput
              id="override-start"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
            <p className="text-xs text-[var(--muted)]">
              {translate(
                'Empty or today: immediately. Days follow the customer timezone (Africa/Casablanca by default).',
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="override-end">{translate('Ends')}</Label>
            <DateInput id="override-end" value={end} onChange={(e) => setEnd(e.target.value)} />
            {windowValid ? (
              <p className="text-xs text-[var(--muted)]">
                {translate('Empty: until revoked. The end day itself is not included.')}
              </p>
            ) : (
              <p role="alert" className="text-sm text-[var(--error-text)]">
                {translate('The end must be after the start.')}
              </p>
            )}
          </div>
        </div>
      }
      onClose={onClose}
      onSubmit={async ({ reason }) => {
        await create.mutateAsync({
          ownerId,
          data: {
            entitlementKey: key,
            booleanValue: limit ? null : enabled,
            integerValue: limit && !unlimited ? parsed : null,
            unlimited: limit && unlimited,
            // Plain calendar days; the API interprets them in the customer timezone.
            startsOn: start || null,
            endsOn: end || null,
            replacesId: replaces?.id ?? null,
            reason,
          },
        })
        await refresh()
      }}
    />
  )
}

export function RevokeOverrideDialog({
  ownerId,
  override,
  onClose,
}: {
  ownerId: string
  override: AdminEntitlementOverride
  onClose: () => void
}) {
  useUiLanguage()
  const revoke = useRevokeAdminEntitlementOverride()
  const refresh = useRefreshAdministration()
  return (
    <CustomerActionDialog
      title={translate('Revoke override')}
      description={`${translate(entitlementLabels[override.entitlementKey])} · ${overrideValueLabel(override)}`}
      impacts={[
        translate('The plan value applies again from now on.'),
        translate('The record stays in the history and the audit log.'),
      ]}
      destructive
      submitLabel={translate('Revoke override')}
      onClose={onClose}
      onSubmit={async (data) => {
        await revoke.mutateAsync({ ownerId, overrideId: override.id, data })
        await refresh()
      }}
    />
  )
}
