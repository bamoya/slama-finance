import { useQueryClient } from '@tanstack/react-query'
import { Ban, MailPlus, Send } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'wouter'

import {
  getListStaffInvitationsQueryKey,
  useListStaffInvitations,
  useResendStaffInvitation,
  useRevokeStaffInvitation,
} from '../../../../../api/generated/identity/identity'
import { listStaffInvitationsQuerySchema } from '../../../../../api/generated/schemas/identity/staff-invitations.schemas'
import { DataTablePagination } from '../../../../../components/management/data-table-pagination'
import { DataTableToolbar } from '../../../../../components/management/data-table-toolbar'
import { FormError } from '../../../../../components/management/form-error'
import { PageHeader } from '../../../../../components/management/page-header'
import { RequestState } from '../../../../../components/management/request-state'
import { StatusBadge } from '../../../../../components/management/status-badge'
import { Button, buttonVariants } from '../../../../../components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '../../../../../components/ui/dialog'
import { Input } from '../../../../../components/ui/input'
import { Select, SelectOption } from '../../../../../components/ui/select'
import { Tooltip } from '../../../../../components/ui/tooltip'
import { displayDateTime } from '../../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { Can } from '../../auth/components/can'
import { useAuthorization } from '../../auth/hooks/use-authorization'

export function StaffInvitationsPage() {
  useUiLanguage()
  const cache = useQueryClient(),
    { can } = useAuthorization()
  const [query, setQuery] = useState(() => listStaffInvitationsQuerySchema.parse({}))
  const list = useListStaffInvitations(query)
  const resend = useResendStaffInvitation(),
    revoke = useRevokeStaffInvitation()
  const [target, setTarget] = useState<{ id: string; email: string } | null>(null)
  const refresh = () => cache.invalidateQueries({ queryKey: getListStaffInvitationsQueryKey() })
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('Administration')}
        title={translate('Staff invitations')}
        description={translate(
          'Pending invitations do not use a member seat. Capacity is checked when accepted.',
        )}
        actions={
          <>
            <Link href="/settings/staff" className={buttonVariants({ variant: 'outline' })}>
              {translate('Staff')}
            </Link>
            <Can permission="staff.create">
              <Link href="/settings/staff/invitations/new" className={buttonVariants({})}>
                <MailPlus size={17} />
                {translate('Invite a staff member')}
              </Link>
            </Can>
          </>
        }
      />
      <FormError error={resend.error ?? revoke.error} />
      <section className="overflow-hidden rounded-panel border border-border bg-card">
        <DataTableToolbar
          activeCount={query.status !== 'pending' ? 1 : 0}
          onReset={() => setQuery(listStaffInvitationsQuerySchema.parse({}))}
        >
          <Input
            className="table-search"
            aria-label={translate('Search invitations')}
            placeholder={translate('Search email')}
            value={query.q ?? ''}
            onChange={(e) => setQuery({ ...query, q: e.target.value || undefined, page: 1 })}
          />
          <Select
            aria-label={translate('Invitation status')}
            value={query.status}
            onValueChange={(status) =>
              setQuery(listStaffInvitationsQuerySchema.parse({ ...query, status, page: 1 }))
            }
          >
            {['pending', 'accepted', 'revoked', 'expired', 'all'].map((status) => (
              <SelectOption key={status} value={status}>
                {translate(status)}
              </SelectOption>
            ))}
          </Select>
        </DataTableToolbar>
        {list.isPending || list.isError ? (
          <div className="p-panel">
            <RequestState query={list} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table data-slot="data-table" className="w-full text-left text-sm">
                <thead>
                  <tr>
                    <th>{translate('Email')}</th>
                    <th>{translate('Assigned roles')}</th>
                    <th>{translate('Invitation status')}</th>
                    <th>{translate('Email delivery')}</th>
                    <th>{translate('Expires')}</th>
                    <th className="text-right">{translate('Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {!list.data.items.length && (
                    <tr>
                      <td colSpan={6} className="p-panel text-center text-muted-foreground">
                        {translate('No invitations found.')}
                      </td>
                    </tr>
                  )}
                  {list.data.items.map((row) => (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap">{row.email}</td>
                      <td>
                        {row.roles.map((role) => role.name).join(', ') ||
                          translate('No roles assigned')}
                      </td>
                      <td>
                        <StatusBadge
                          label={row.status}
                          tone={
                            row.status === 'accepted'
                              ? 'active'
                              : row.status === 'pending'
                                ? 'draft'
                                : 'archived'
                          }
                        />
                      </td>
                      <td>
                        {translate(row.delivery.state)} · {row.delivery.attempts}
                      </td>
                      <td className="whitespace-nowrap">
                        {row.expiresAt ? displayDateTime(row.expiresAt) : translate('Not sent yet')}
                      </td>
                      <td>
                        <div className="flex justify-end gap-2">
                          {can('staff.update') && ['pending', 'expired'].includes(row.status) && (
                            <>
                              <Tooltip label={translate('Resend invitation')}>
                                <Button
                                  size="icon"
                                  variant="outline"
                                  aria-label={translate('Resend invitation')}
                                  disabled={resend.isPending}
                                  onClick={() => {
                                    resend.mutate(
                                      { invitationId: row.id },
                                      { onSuccess: () => void refresh() },
                                    )
                                  }}
                                >
                                  <Send size={16} />
                                </Button>
                              </Tooltip>
                              <Tooltip label={translate('Revoke invitation')}>
                                <Button
                                  size="icon"
                                  variant="destructive"
                                  aria-label={translate('Revoke invitation')}
                                  onClick={() => setTarget(row)}
                                >
                                  <Ban size={16} />
                                </Button>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              total={list.data.total}
              page={query.page}
              pageSize={query.pageSize}
              onPage={(page) => setQuery({ ...query, page })}
              onPageSizeChange={(pageSize) => setQuery({ ...query, pageSize, page: 1 })}
            />
          </>
        )}
      </section>
      <Dialog
        open={!!target}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
      >
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">
            {translate('Revoke invitation')}
          </DialogTitle>
          <DialogDescription className="my-4 text-sm text-muted-foreground">
            {translate('This link will no longer allow access.')} {target?.email}
          </DialogDescription>
          <FormError error={revoke.error} />
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTarget(null)}>
              {translate('Back')}
            </Button>
            <Button
              variant="destructive"
              disabled={revoke.isPending}
              onClick={() => {
                if (target)
                  revoke.mutate(
                    { invitationId: target.id },
                    {
                      onSuccess: () => {
                        setTarget(null)
                        void refresh()
                      },
                    },
                  )
              }}
            >
              {translate('Revoke invitation')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
