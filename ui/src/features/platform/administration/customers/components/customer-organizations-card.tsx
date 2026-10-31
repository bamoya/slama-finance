import { Ellipsis, Pause, Play } from 'lucide-react'

import type { AdminOwnerDetailOrganizationsItem } from '../../../../../api/generated/models'
import { type DataColumn, DataTable } from '../../../../../components/management/data-table'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Button } from '../../../../../components/ui/button'
import { Card, CardHeader, CardTitle } from '../../../../../components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../../../components/ui/dropdown-menu'
import { displayDateTime } from '../../../../../lib/dates'
import { translate } from '../../../../../lib/i18n'
import type { CustomerAction } from './customer-action'

type Organization = AdminOwnerDetailOrganizationsItem

const states = {
  setup: { label: 'Setting up', tone: 'archived' },
  active: { label: 'Organization active', tone: 'active' },
  paused: { label: 'Paused', tone: 'draft' },
  suspended: { label: 'Organization suspended', tone: 'overdue' },
  pending_deletion: { label: 'Pending deletion', tone: 'overdue' },
} as const

export function CustomerOrganizationsCard({
  organizations,
  onSelect,
}: {
  organizations: Organization[]
  onSelect: (action: CustomerAction) => void
}) {
  const columns: DataColumn<Organization>[] = [
    {
      title: 'Organization',
      render: (organization) => <span className="font-semibold">{organization.name}</span>,
    },
    {
      title: 'Status',
      render: (organization) => (
        <>
          <StatusBadge
            label={states[organization.state].label}
            tone={states[organization.state].tone}
          />
          {organization.suspendedAt && (
            <p className="mt-1 text-xs text-[var(--muted)]">
              {displayDateTime(organization.suspendedAt)}
              {organization.suspensionReason && ` · ${organization.suspensionReason}`}
            </p>
          )}
        </>
      ),
    },
    {
      title: 'Created',
      render: (organization) => (
        <span className="whitespace-nowrap">{displayDateTime(organization.createdAt)}</span>
      ),
    },
    {
      title: 'Actions',
      align: 'right',
      render: (organization) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-md"
              aria-label={translate('Actions for {{name}}', { name: organization.name })}
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {organization.state === 'suspended' ? (
              <DropdownMenuItem
                onSelect={() => onSelect({ kind: 'reactivate-organization', organization })}
              >
                <Play aria-hidden="true" />
                {translate('Reactivate organization')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onSelect={() => onSelect({ kind: 'suspend-organization', organization })}
              >
                <Pause aria-hidden="true" />
                {translate('Suspend organization')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]
  return (
    <section aria-label={translate('Organizations')}>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="border-b border-[var(--border)] p-4">
          <CardTitle>{translate('Organizations')}</CardTitle>
        </CardHeader>
        <DataTable
          items={organizations}
          columns={columns}
          emptyTitle={translate('No organizations yet.')}
          emptyDescription={translate(
            'The customer creates their first organization after signing in.',
          )}
        />
      </Card>
    </section>
  )
}
