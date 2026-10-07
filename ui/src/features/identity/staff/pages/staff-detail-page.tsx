import { useQueryClient } from '@tanstack/react-query'
import { Archive, Ban, Check, KeyRound, Pencil, RotateCcw, Save } from 'lucide-react'
import { useState } from 'react'
import { Link, useParams } from 'wouter'

import type {
  StaffDetail,
  TemporaryPassword,
} from '../../../../api/generated/schemas/identity/staff.schemas'
import { ConfirmAction } from '../../../../components/management/confirm-action'
import { FormActionBar } from '../../../../components/management/form-action-bar'
import { MoreActions } from '../../../../components/management/more-actions'
import { PageHeader } from '../../../../components/management/page-header'
import { RequestState } from '../../../../components/management/request-state'
import { StatusBadge } from '../../../../components/management/status-badge'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../auth/components/can'
import { useAuthorization } from '../../auth/hooks/use-authorization'
import { useSession } from '../../auth/hooks/use-session'
import { refreshIdentity, useRoles, useStaff, useStaffActions } from '../../shared/queries'
import { RolePicker } from '../components/role-picker'
import { TemporaryCredential } from '../components/temporary-credential'

export function StaffDetailPage() {
  useUiLanguage()

  const { staffId = '' } = useParams<{ staffId: string }>()
  const staff = useStaff(staffId)
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link href="/settings/staff" className="text-sm font-semibold text-[var(--muted)]">
        {translate('← Back to staff')}
      </Link>
      {staff.isPending || staff.isError ? (
        <RequestState query={staff} />
      ) : (
        <StaffAccount key={staffId} person={staff.data} />
      )}
    </div>
  )
}
function StaffAccount({ person }: { person: StaffDetail }) {
  useUiLanguage()

  const { can: hasAccess } = useAuthorization()

  const staffApi = useStaffActions()

  const cache = useQueryClient()
  const session = useSession()
  const [credential, setCredential] = useState<TemporaryPassword | null>(null)
  const [notice, setNotice] = useState('')
  const can = (action: string) => !person.archivedAt && (hasAccess(`staff.${action}`) ?? false)
  const canAccess = ['disable', 'enable', 'archive', 'reset_password'].some(can)
  const self = person.id === session.data?.user.id
  const name = [person.firstName, person.lastName].filter(Boolean).join(' ') || person.email
  const status = person.archivedAt
    ? translate('Archived')
    : person.disabledAt
      ? translate('Disabled')
      : translate('Active')
  const updateStatus = async (action: 'enable' | 'disable' | 'archive') => {
    await staffApi[action](person.id)
    setNotice(
      action === 'enable'
        ? translate('Account enabled.')
        : action === 'disable'
          ? translate('Account disabled and sessions revoked.')
          : translate('Account archived. Its history has been preserved.'),
    )
    await refreshIdentity(cache)
  }
  return (
    <>
      <PageHeader
        eyebrow={translate('Administration / Staff')}
        title={name}
        description={person.email}
        actions={
          <>
            {!person.archivedAt && (
              <MoreActions>
                {person.disabledAt ? (
                  <Can permission="staff.update">
                    <ConfirmAction
                      label={translate('Enable account')}
                      icon={<Check size={16} />}
                      description={translate(
                        'Allow this account to sign in again? Its assigned roles will remain unchanged.',
                      )}
                      onConfirm={() => updateStatus('enable')}
                    />
                  </Can>
                ) : (
                  <Can permission="staff.update">
                    <ConfirmAction
                      label={translate('Disable account')}
                      variant="outline"
                      icon={<Ban size={16} />}
                      description={
                        self
                          ? translate(
                              'Disable your own account and end your current session? Another administrator will need to restore your access.',
                            )
                          : translate(
                              'Block this account from signing in and revoke all of its sessions?',
                            )
                      }
                      onConfirm={() => updateStatus('disable')}
                    />
                  </Can>
                )}
                <Can permission="staff.update">
                  <ConfirmAction
                    label={translate('Archive account')}
                    variant="destructive"
                    icon={<Archive size={16} />}
                    description={
                      self
                        ? translate(
                            'Archive your own account and end your current session? This cannot be undone through the dashboard.',
                          )
                        : translate(
                            'Archive this account? It will no longer be editable or able to sign in. Historical records are preserved. This cannot be undone through the dashboard.',
                          )
                    }
                    onConfirm={() => updateStatus('archive')}
                  />
                </Can>
                <Can permission="staff.update">
                  {!self && (
                    <ConfirmAction
                      label={translate('Reissue temporary password')}
                      variant="outline"
                      icon={<KeyRound size={16} />}
                      description={translate(
                        "Replace this person's password and revoke all sessions and reset links? A new one-use password will be displayed once. Share it securely; no email is sent.",
                      )}
                      onConfirm={async () => {
                        const result = await staffApi.reissue(person.id)
                        setCredential(result)
                        setNotice('A new temporary password was issued.')
                      }}
                    />
                  )}
                </Can>
              </MoreActions>
            )}
            <Can permission="staff.update">
              {!person.archivedAt && (
                <Link href={`/settings/staff/${person.id}/edit`} className={buttonVariants({})}>
                  <Pencil size={16} aria-hidden="true" />
                  {translate('Edit profile')}
                </Link>
              )}
            </Can>
          </>
        }
      />
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm"
        >
          {notice}
        </p>
      )}
      <div className="grid items-start gap-section xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-section">
          <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h3 className="mb-5 text-lg font-bold">{translate('Account details')}</h3>
            <dl className="grid gap-content sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--muted)]">{translate('First name')}</dt>
                <dd className="mt-1 font-semibold">{person.firstName || '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--muted)]">{translate('Family name')}</dt>
                <dd className="mt-1 font-semibold">{person.lastName || '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--muted)]">{translate('Email address')}</dt>
                <dd className="mt-1 break-all">{person.email}</dd>
              </div>
              <div>
                <dt className="mb-2 text-sm text-[var(--muted)]">{translate('Account status')}</dt>
                <dd>
                  <StatusBadge
                    label={status}
                    tone={status === translate('Active') ? 'active' : 'archived'}
                  />
                </dd>
              </div>
            </dl>
          </section>
          <StaffRoles person={person} canManage={can('update') && hasAccess('roles.update')} />
          <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h3 className="text-lg font-bold">{translate('Effective permissions')}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {translate(
                'Inherited from assigned roles; permissions are not granted directly to users.',
              )}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {person.permissionKeys.length ? (
                person.permissionKeys.map((key) => (
                  <code
                    key={key}
                    className="rounded-lg bg-[var(--surface-muted)] px-3 py-2 text-xs"
                  >
                    {key}
                  </code>
                ))
              ) : (
                <p className="text-sm text-[var(--muted)]">
                  {translate('No permissions assigned.')}
                </p>
              )}
            </div>
          </section>
        </div>
        <aside className="space-y-section">
          <section className="space-y-4 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
            <h3 className="font-bold">{translate('Access & security')}</h3>
            {person.archivedAt ? (
              <p className="text-sm text-[var(--muted)]">
                {translate(
                  'Archived accounts are read-only and cannot sign in. Reactivation is not supported.',
                )}
              </p>
            ) : !canAccess ? (
              <p className="text-sm text-[var(--muted)]">
                {translate('You have read-only access to this account.')}
              </p>
            ) : (
              <>
                <p className="text-sm text-[var(--muted)]">
                  {translate(
                    'Disabling blocks sign-in and revokes sessions. Archiving preserves the account’s history. The last active administrator is protected.',
                  )}
                </p>
                {person.disabledAt && (
                  <p className="text-xs text-[var(--muted)]">
                    {translate('A new password does not enable a disabled account.')}
                  </p>
                )}
              </>
            )}
          </section>
        </aside>
      </div>
      {credential && (
        <TemporaryCredential
          credential={credential}
          email={person.email}
          onDismiss={() => setCredential(null)}
        />
      )}
    </>
  )
}
function StaffRoles({ person, canManage }: { person: StaffDetail; canManage: boolean }) {
  useUiLanguage()

  const { can: hasAccess } = useAuthorization()

  const staffApi = useStaffActions()

  const session = useSession()
  const canReadRoles = hasAccess('roles.read') ?? false
  const roles = useRoles(canManage && canReadRoles)
  const [selected, setSelected] = useState(person.roles.map((role) => role.id))
  const [baseline, setBaseline] = useState(person.roles.map((role) => role.id))
  const [saved, setSaved] = useState(false)
  const cache = useQueryClient()
  const signature = (ids: string[]) => [...ids].sort().join('|')
  const changed = signature(baseline) !== signature(person.roles.map((role) => role.id))
  const dirty = signature(baseline) !== signature(selected)
  return (
    <section className="space-y-content rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
      <h3 className="text-lg font-bold">{translate('Roles')}</h3>
      {!canManage || !canReadRoles ? (
        <>
          <div className="flex flex-wrap gap-2">
            {person.roles.map((role) => (
              <span
                key={role.id}
                className="rounded-full bg-[var(--surface-muted)] px-3 py-2 text-sm"
              >
                {role.name}
              </span>
            ))}
            {!person.roles.length && <p>{translate('No roles assigned.')}</p>}
          </div>
          {canManage && (
            <p className="text-sm text-[var(--muted)]">
              {translate('Role assignment requires access to the role catalog (roles.read).')}
            </p>
          )}
        </>
      ) : roles.isPending || roles.isError ? (
        <RequestState query={roles} />
      ) : (
        <>
          <RolePicker
            roles={roles.data}
            selected={selected}
            onChange={(value) => {
              setSelected(value)
              setSaved(false)
            }}
            allowedKeys={session.data?.permissionKeys ?? []}
            disabled={changed}
          />
          {changed && (
            <p role="alert" className="text-sm">
              {translate('Assignments changed. Reload the selection before saving.')}
            </p>
          )}
          {saved && !dirty && (
            <p role="status" className="text-sm text-[var(--accent)]">
              {translate('Roles saved.')}
            </p>
          )}
          <FormActionBar>
            <Button
              variant="outline"

              disabled={!dirty && !changed}
              onClick={() => {
                const ids = person.roles.map((role) => role.id)
                setSelected(ids)
                setBaseline(ids)
                setSaved(false)
              }}
            >
              <RotateCcw size={16} aria-hidden="true" />
              {translate('Reload selection')}
            </Button>
            <ConfirmAction
              label={translate('Save roles')}
              icon={<Save size={16} />}
              disabled={!dirty || changed}
              description={
                selected.length
                  ? translate(
                      'Replace this account’s assigned roles? Its effective access will change immediately on the API.',
                    )
                  : translate(
                      'Remove every role from this account? It will lose all staff and role-management permissions.',
                    )
              }
              onConfirm={async () => {
                await staffApi.replaceRoles(person.id, { roleIds: selected })
                setBaseline(selected)
                setSaved(true)
                await refreshIdentity(cache)
              }}
            />
          </FormActionBar>
        </>
      )}
    </section>
  )
}
