import {
  ArrowLeftRight,
  Ban,
  CalendarPlus,
  ChevronDown,
  CirclePlay,
  LockOpen,
  MailPlus,
  Pause,
  Play,
  Trash2,
  Undo2,
} from 'lucide-react'

import type { AdminOwnerDetail } from '../../../../../api/generated/models'
import { Button } from '../../../../../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../../../../../components/ui/dropdown-menu'
import { Separator } from '../../../../../components/ui/separator'
import { translate } from '../../../../../lib/i18n'
import type { CustomerAction } from './customer-action'

const groupLabel = 'px-3 pb-1 pt-2 text-xs font-semibold uppercase text-[var(--muted)]'

/** Lifecycle actions of one customer, grouped by what they affect. */
export function CustomerActionsMenu({
  detail,
  onSelect,
}: {
  detail: AdminOwnerDetail
  onSelect: (action: CustomerAction) => void
}) {
  const { subscription, restriction } = detail
  // Subscription operations need the customer's resolved plan terms; access and organization operations do not.
  const unresolved = subscription === null
  const suspended = subscription?.status === 'suspended'
  // A trial, running or ended, that never received coverage.
  const activatable =
    subscription?.planCode === 'trial' &&
    (subscription.status === 'trial' ||
      subscription.status === 'past_due' ||
      subscription.status === 'expired')
  const blocked = restriction.blockedAt !== null
  const deletionScheduled = restriction.deletionRequestedAt !== null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline">
          {translate('Actions')}
          <ChevronDown data-icon="inline-end" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel className={groupLabel}>{translate('Subscription')}</DropdownMenuLabel>
          {activatable && (
            <DropdownMenuItem onSelect={() => onSelect({ kind: 'activate-plan' })}>
              <CirclePlay aria-hidden="true" />
              {translate('Activate a plan')}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            disabled={unresolved || suspended || subscription.planCode === 'trial'}
            onSelect={() => onSelect({ kind: 'change-plan' })}
          >
            <ArrowLeftRight aria-hidden="true" />
            {translate('Change plan')}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={unresolved || suspended || subscription.status === 'not_started'}
            onSelect={() => onSelect({ kind: 'extend' })}
          >
            <CalendarPlus aria-hidden="true" />
            {translate('Extend coverage')}
          </DropdownMenuItem>
          {suspended ? (
            <DropdownMenuItem onSelect={() => onSelect({ kind: 'resume-subscription' })}>
              <Play aria-hidden="true" />
              {translate('Resume subscription')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              disabled={unresolved || subscription.status === 'not_started'}
              onSelect={() => onSelect({ kind: 'suspend-subscription' })}
            >
              <Pause aria-hidden="true" />
              {translate('Suspend subscription')}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <Separator className="my-1" />
        <DropdownMenuGroup>
          <DropdownMenuLabel className={groupLabel}>{translate('Access')}</DropdownMenuLabel>
          {blocked ? (
            <DropdownMenuItem onSelect={() => onSelect({ kind: 'unblock' })}>
              <LockOpen aria-hidden="true" />
              {translate('Unblock customer')}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => onSelect({ kind: 'block' })}>
              <Ban aria-hidden="true" />
              {translate('Block customer')}
            </DropdownMenuItem>
          )}
          {detail.invitationPending && (
            <DropdownMenuItem onSelect={() => onSelect({ kind: 'resend-invitation' })}>
              <MailPlus aria-hidden="true" />
              {translate('Resend invitation')}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <Separator className="my-1" />
        {deletionScheduled ? (
          <DropdownMenuItem onSelect={() => onSelect({ kind: 'cancel-deletion' })}>
            <Undo2 aria-hidden="true" />
            {translate('Cancel deletion')}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem variant="destructive" onSelect={() => onSelect({ kind: 'delete' })}>
            <Trash2 aria-hidden="true" />
            {translate('Delete customer')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
