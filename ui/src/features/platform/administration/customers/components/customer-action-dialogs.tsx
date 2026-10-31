import { useState } from 'react'

import {
  blockAdminOwner,
  cancelAdminOwnerDeletion,
  changeAdminSubscriptionPlan,
  extendAdminSubscription,
  reactivateAdminOrganization,
  renameAdminOrganizationSlug,
  resendAdminOwnerInvitation,
  resumeAdminSubscription,
  scheduleAdminOwnerDeletion,
  suspendAdminOrganization,
  suspendAdminSubscription,
  unblockAdminOwner,
} from '../../../../../api/generated/administration/administration'
import type { AdminOwnerDetail } from '../../../../../api/generated/models'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { Select, SelectGroup, SelectOption } from '../../../../../components/ui/select'
import { translate } from '../../../../../lib/i18n'
import { formatSlug } from '../../../../../lib/organization-slug'
import { organizationAddress } from '../../../../../lib/platform-sites'
import { planLabel } from '../../../subscriptions/components/billing-format'
import { useRefreshAdministration } from '../hooks/use-refresh-administration'
import type { CustomerAction } from './customer-action'
import { type ActionInput, CustomerActionDialog } from './customer-action-dialog'

const paidPlans = ['essential', 'business', 'pro'] as const
type PaidPlan = (typeof paidPlans)[number]

function PlanChangeFields({
  current,
  value,
  onChange,
}: {
  current: string
  value: PaidPlan
  onChange: (plan: PaidPlan) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="action-plan">{translate('New plan')}</Label>
      <Select
        id="action-plan"
        aria-label={translate('New plan')}
        value={value}
        onValueChange={(plan) => onChange(plan as PaidPlan)}
      >
        <SelectGroup>
          {paidPlans.map((plan) => (
            <SelectOption key={plan} value={plan} disabled={plan === current}>
              {planLabel(plan)}
            </SelectOption>
          ))}
        </SelectGroup>
      </Select>
      <p className="text-xs text-[var(--muted)]">
        {translate('Free adjustment by an administrator: no payment is requested or recorded.')}
      </p>
    </div>
  )
}

/** Live-formatted new address with the resulting host; the server remains the authority. */
export function AddressChangeFields({
  current,
  value,
  onChange,
}: {
  current: string
  value: string
  onChange: (slug: string) => void
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="action-address">{translate('New address')}</Label>
      <Input
        id="action-address"
        maxLength={40}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(formatSlug(event.target.value))}
        onBlur={() => onChange(formatSlug(value, true))}
      />
      <p className="text-sm">
        <span className="text-[var(--muted)]">{translate('Current address')}: </span>
        {organizationAddress(current)}
      </p>
      <p className="text-sm font-semibold break-all">https://{organizationAddress(value || '…')}</p>
    </div>
  )
}

export const validAddress = (slug: string, current: string) =>
  /^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/.test(slug) && slug !== current

function ExtensionFields({ days, onChange }: { days: string; onChange: (days: string) => void }) {
  const invalid =
    days !== '' && !(Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 366)
  return (
    <div className="space-y-2">
      <Label htmlFor="action-days">{translate('Days to add')}</Label>
      <Input
        id="action-days"
        type="number"
        inputMode="numeric"
        min={1}
        max={366}
        step={1}
        value={days}
        aria-invalid={invalid}
        onChange={(event) => onChange(event.target.value)}
      />
      <p className={invalid ? 'text-sm text-[var(--error-text)]' : 'text-xs text-[var(--muted)]'}>
        {translate('Between 1 and 366 days.')}
      </p>
    </div>
  )
}

/** Opens the dialog of the chosen lifecycle action and refreshes the administration queries after it. */
export function CustomerActionDialogs({
  detail,
  action,
  onClose,
}: {
  detail: AdminOwnerDetail
  action: CustomerAction
  onClose: () => void
}) {
  const refresh = useRefreshAdministration()
  const ownerId = detail.owner.id
  const email = detail.owner.email
  const count = detail.organizations.length
  const currentPlan = detail.subscription.planCode
  const [plan, setPlan] = useState<PaidPlan>(
    paidPlans.find((item) => item !== currentPlan) ?? 'essential',
  )
  const [days, setDays] = useState('30')
  const [address, setAddress] = useState('')
  const run = (call: (input: ActionInput) => Promise<unknown>) => async (input: ActionInput) => {
    await call(input)
    await refresh()
  }
  const sensitive = ({ reason, code }: ActionInput) => ({ reason, code })
  const reasonOnly = ({ reason }: ActionInput) => ({ reason })
  switch (action.kind) {
    case 'change-plan':
      return (
        <CustomerActionDialog
          title={translate('Change plan')}
          description={translate('Switch the current paid period to another plan immediately.')}
          impacts={[
            translate('The new plan applies right away, with the same coverage dates.'),
            translate('No payment is requested. A 0 DH adjustment is added to the history.'),
            translate('Downgrading never deletes data.'),
          ]}
          submitLabel={translate('Change plan')}
          fields={<PlanChangeFields current={currentPlan} value={plan} onChange={setPlan} />}
          onClose={onClose}
          onSubmit={run((input) =>
            changeAdminSubscriptionPlan(ownerId, { planCode: plan, reason: input.reason }),
          )}
        />
      )
    case 'extend': {
      const valid = Number.isInteger(Number(days)) && Number(days) >= 1 && Number(days) <= 366
      return (
        <CustomerActionDialog
          title={translate('Extend coverage')}
          description={translate(
            'Add days to the paid coverage, or to the trial when there is no paid coverage.',
          )}
          impacts={[
            translate('The coverage end date moves forward by the number of days entered.'),
            translate('A 0 DH adjustment is added to the payment history.'),
          ]}
          submitLabel={translate('Extend coverage')}
          fields={<ExtensionFields days={days} onChange={setDays} />}
          fieldsReady={valid}
          onClose={onClose}
          onSubmit={run((input) =>
            extendAdminSubscription(ownerId, { days: Number(days), reason: input.reason }),
          )}
        />
      )
    }
    case 'suspend-subscription':
      return (
        <CustomerActionDialog
          title={translate('Suspend subscription')}
          description={translate('Blocks access and freezes the coverage clock.')}
          impacts={[
            translate('Organizations of this customer become unavailable ({{count}}).', { count }),
            translate('The coverage clock is frozen until the subscription is resumed.'),
            translate('The customer is not told the reason.'),
          ]}
          sensitive
          destructive
          submitLabel={translate('Suspend subscription')}
          onClose={onClose}
          onSubmit={run((input) => suspendAdminSubscription(ownerId, sensitive(input)))}
        />
      )
    case 'resume-subscription':
      return (
        <CustomerActionDialog
          title={translate('Resume subscription')}
          description={translate('Restores access to the customer.')}
          impacts={[
            translate('Access is restored.'),
            translate('Remaining paid or trial time is shifted by the suspended duration.'),
          ]}
          submitLabel={translate('Resume subscription')}
          onClose={onClose}
          onSubmit={run((input) => resumeAdminSubscription(ownerId, reasonOnly(input)))}
        />
      )
    case 'block':
      return (
        <CustomerActionDialog
          title={translate('Block customer')}
          description={translate(
            'Blocks the owner portal and every organization of this customer.',
          )}
          impacts={[
            translate('Organizations of this customer become unavailable ({{count}}).', { count }),
            translate('All sessions of the customer and their staff are closed.'),
            translate('A payment never lifts the block: only unblocking does.'),
          ]}
          sensitive
          destructive
          submitLabel={translate('Block customer')}
          onClose={onClose}
          onSubmit={run((input) => blockAdminOwner(ownerId, sensitive(input)))}
        />
      )
    case 'unblock':
      return (
        <CustomerActionDialog
          title={translate('Unblock customer')}
          description={translate('Lifts the administrator block.')}
          impacts={[
            translate('The customer and their staff can sign in again.'),
            translate('Other restrictions (scheduled deletion, suspensions) remain.'),
          ]}
          submitLabel={translate('Unblock customer')}
          onClose={onClose}
          onSubmit={run((input) => unblockAdminOwner(ownerId, reasonOnly(input)))}
        />
      )
    case 'resend-invitation':
      return (
        <CustomerActionDialog
          title={translate('Resend invitation')}
          description={translate('Sends a new email to set the password.')}
          impacts={[
            translate('A new link valid for 72 hours is emailed to {{email}}.', { email }),
            translate('Earlier links stop working.'),
          ]}
          submitLabel={translate('Resend invitation')}
          onClose={onClose}
          onSubmit={run((input) => resendAdminOwnerInvitation(ownerId, reasonOnly(input)))}
        />
      )
    case 'delete':
      return (
        <CustomerActionDialog
          title={translate('Delete customer')}
          description={translate('Schedules the permanent deletion of this customer.')}
          impacts={[
            translate(
              'The customer is blocked immediately: organizations unavailable ({{count}}), sessions closed.',
              { count },
            ),
            translate('Deletion is scheduled 30 days from now and can be cancelled until then.'),
            translate('Permanent removal of data is not automatic yet.'),
          ]}
          sensitive
          destructive
          confirmEmail={email}
          submitLabel={translate('Delete customer')}
          onClose={onClose}
          onSubmit={run((input) => scheduleAdminOwnerDeletion(ownerId, sensitive(input)))}
        />
      )
    case 'cancel-deletion':
      return (
        <CustomerActionDialog
          title={translate('Cancel deletion')}
          description={translate('Cancels the scheduled deletion before its due date.')}
          impacts={[
            translate('The previous state is restored, including any outstanding restriction.'),
          ]}
          submitLabel={translate('Cancel deletion')}
          onClose={onClose}
          onSubmit={run((input) => cancelAdminOwnerDeletion(ownerId, reasonOnly(input)))}
        />
      )
    case 'change-address':
      return (
        <CustomerActionDialog
          title={translate('Change address')}
          description={action.organization.name}
          impacts={[
            translate('The organization moves to the new address immediately.'),
            translate('The former address keeps redirecting to the new one.'),
            translate('All sessions of this organization are closed: staff sign in again.'),
          ]}
          sensitive
          submitLabel={translate('Change address')}
          fields={
            <AddressChangeFields
              current={action.organization.slug}
              value={address}
              onChange={setAddress}
            />
          }
          fieldsReady={validAddress(address, action.organization.slug)}
          onClose={onClose}
          onSubmit={run((input) =>
            renameAdminOrganizationSlug(action.organization.id, {
              slug: address,
              reason: input.reason,
              code: input.code,
            }),
          )}
        />
      )
    case 'suspend-organization':
      return (
        <CustomerActionDialog
          title={translate('Suspend organization')}
          description={action.organization.name}
          impacts={[
            translate('Sessions of this organization are closed and sign-in stops.'),
            translate('Background workers of this organization stop.'),
            translate('Only an administrator can reactivate it.'),
          ]}
          sensitive
          destructive
          submitLabel={translate('Suspend organization')}
          onClose={onClose}
          onSubmit={run((input) =>
            suspendAdminOrganization(action.organization.id, sensitive(input)),
          )}
        />
      )
    case 'reactivate-organization':
      return (
        <CustomerActionDialog
          title={translate('Reactivate organization')}
          description={action.organization.name}
          impacts={[translate('Users of this organization can sign in again.')]}
          submitLabel={translate('Reactivate organization')}
          onClose={onClose}
          onSubmit={run((input) =>
            reactivateAdminOrganization(action.organization.id, reasonOnly(input)),
          )}
        />
      )
  }
}
