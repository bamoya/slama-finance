import { useQueryClient } from '@tanstack/react-query'
import { Plus, RotateCcw, Save, ShieldCheck, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useParams } from 'wouter'

import type { Permission, Role } from '../../../../api/generated/schemas/identity/rbac.schemas'
import { ConfirmAction } from '../../../../components/management/confirm-action'
import { FormActionBar } from '../../../../components/management/form-action-bar'
import { MoreActions } from '../../../../components/management/more-actions'
import { PageHeader } from '../../../../components/management/page-header'
import { EmptyState } from '../../../../components/management/page-state'
import { RequestState } from '../../../../components/management/request-state'
import { useTableSelection } from '../../../../components/management/use-table-selection'
import { Button, buttonVariants } from '../../../../components/ui/button'
import { Checkbox } from '../../../../components/ui/checkbox'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../auth/components/can'
import { useAuthorization } from '../../auth/hooks/use-authorization'
import { useSession } from '../../auth/hooks/use-session'
import { hasPermission } from '../../auth/permissions'
import { refreshIdentity, usePermissions, useRoleActions, useRoles } from '../../shared/queries'
import { PermissionMatrix } from '../components/permission-matrix'
import { RoleBulkActions } from '../components/role-bulk-actions'

export function RolesPage() {
  useUiLanguage()

  const { t } = useTranslation('bulk')
  const { can: hasAccess } = useAuthorization()

  const roles = useRoles()
  const selection = useTableSelection(roles.data ?? [], 'roles')
  const permissions = usePermissions()
  const { roleId } = useParams<{ roleId?: string }>()
  const session = useSession()
  const role =
    roles.data?.find((item) => item.id === roleId) ?? (!roleId ? roles.data?.[0] : undefined)
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('Administration')}
        title={translate('Roles & permissions')}
        description={translate('Define responsibilities once, then assign roles to your team.')}
        actions={
          <Can permission="roles.create">
            {
              <Link href="/settings/roles/new" className={buttonVariants({})}>
                <Plus size={17} />
                {translate('Create role')}
              </Link>
            }
          </Can>
        }
      />
      <RoleBulkActions selected={selection.selected} clear={selection.clear} />
      {roles.isPending || roles.isError ? (
        <RequestState query={roles} />
      ) : permissions.isPending || permissions.isError ? (
        <RequestState query={permissions} />
      ) : !roles.data.length ? (
        <EmptyState
          title={translate('No roles yet')}
          description={translate('Create a role to define what your staff can do.')}
        />
      ) : (
        <div className="grid items-start gap-section lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="space-y-2 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-3">
            <p className="px-3 py-2 text-xs font-semibold uppercase text-[var(--muted)]">
              {translate('Company roles ·')} {roles.data.length}
            </p>
            {hasAccess('roles.delete') && (
              <label className="flex items-center gap-2 px-1 py-2 text-sm">
                <Checkbox
                  checked={selection.all || (selection.some ? 'indeterminate' : false)}
                  onCheckedChange={(checked) => selection.togglePage(checked === true)}
                />
                {t('selectPage')}
              </label>
            )}
            {roles.data.map((item) => (
              <div key={item.id} className="flex items-center gap-1">
                {hasAccess('roles.delete') && (
                  <Checkbox
                    aria-label={t('selectRow', { name: item.name })}
                    checked={selection.ids.includes(item.id)}
                    onCheckedChange={(checked) => selection.toggle(item.id, checked === true)}
                  />
                )}
                <Link
                  key={item.id}
                  href={`/settings/roles/${item.id}`}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 ${role?.id === item.id ? 'bg-[var(--accent-soft)] text-[var(--accent)]' : ''}`}
                  aria-current={role?.id === item.id ? 'page' : undefined}
                >
                  <ShieldCheck size={18} />
                  <span className="min-w-0">
                    <strong className="block truncate text-sm">{item.name}</strong>
                    <small className="text-[var(--muted)]">
                      {item.isSystem
                        ? translate('System role')
                        : translate('{{value0}} permissions', {
                            value0: item.permissionKeys.length,
                          })}
                    </small>
                  </span>
                </Link>
              </div>
            ))}
          </aside>
          {role ? (
            <PermissionEditor
              key={role.id}
              role={role}
              permissions={permissions.data}
              allowedKeys={session.data?.permissionKeys ?? []}
              canUpdate={hasAccess('roles.update')}
            />
          ) : (
            <EmptyState
              title={translate('Role not found')}
              description={translate('Select an existing role from the list.')}
            />
          )}
        </div>
      )}
    </div>
  )
}
function PermissionEditor({
  role,
  permissions,
  allowedKeys,
  canUpdate,
}: {
  role: Role
  permissions: Permission[]
  allowedKeys: string[]
  canUpdate: boolean
}) {
  useUiLanguage()

  const rolesApi = useRoleActions()

  const cache = useQueryClient()
  const [, navigate] = useLocation()
  const [selected, setSelected] = useState(role.permissionKeys)
  const [baseline, setBaseline] = useState(role.permissionKeys)
  const [saved, setSaved] = useState(false)
  const signature = (keys: string[]) => [...keys].sort().join('|')
  const changedOnServer = signature(baseline) !== signature(role.permissionKeys)
  const dirty = signature(selected) !== signature(baseline)
  const locked =
    role.key === 'admin' ||
    role.isSystem ||
    !canUpdate ||
    role.permissionKeys.some((key) => !hasPermission(allowedKeys, key))
  const deleteAllowed =
    !role.isSystem &&
    role.key !== 'admin' &&
    role.permissionKeys.every((key) => hasPermission(allowedKeys, key))
  return (
    <section className="overflow-hidden rounded-panel border border-[var(--border)] bg-[var(--surface)]">
      <header className="space-y-3 border-b border-[var(--border)] p-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold">{role.name}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {role.description || translate('No description provided.')}
            </p>
            <code className="mt-2 block text-xs text-[var(--muted)]">{role.key}</code>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-[var(--surface-muted)] px-3 py-1 text-xs font-semibold">
              {selected.length} {translate('selected')}
            </span>
            {deleteAllowed && (
              <Can permission="roles.delete">
                <MoreActions>
                  <ConfirmAction
                    label={translate('Delete role')}
                    variant="destructive"
                    icon={<Trash2 size={16} />}
                    description={translate(
                      'Permanently delete “{{value0}}”? All staff and permission assignments for this role will be removed. Staff accounts remain, keeping only permissions from their other roles. Staff with no other roles will lose role-based access. This cannot be undone.',
                      { value0: role.name },
                    )}
                    onConfirm={async () => {
                      await rolesApi.remove(role.id)
                      await refreshIdentity(cache)
                      navigate('/settings/roles', { replace: true })
                    }}
                  />
                </MoreActions>
              </Can>
            )}
          </div>
        </div>
        {locked && (
          <p className="text-sm text-[var(--muted)]">
            {role.isSystem
              ? translate('System administrator permissions are protected.')
              : translate(
                  'Read-only: you need role-management access and all of this role’s permissions to edit it.',
                )}
          </p>
        )}
        {changedOnServer && (
          <p role="alert" className="text-sm text-[var(--muted)]">
            {translate(
              'This role changed since you opened it. Reload the selection before saving.',
            )}
          </p>
        )}
        {saved && !dirty && (
          <p role="status" className="text-sm text-[var(--accent)]">
            {translate('Permissions saved.')}
          </p>
        )}
      </header>
      <PermissionMatrix
        permissions={permissions}
        selected={selected}
        allowedKeys={allowedKeys}
        disabled={locked || changedOnServer}
        onChange={(keys) => {
          setSaved(false)
          setSelected(keys)
        }}
      />
      <FormActionBar>
        <Button
          variant="outline"

          disabled={!dirty && !changedOnServer}
          onClick={() => {
            setSelected(role.permissionKeys)
            setBaseline(role.permissionKeys)
            setSaved(false)
          }}
        >
          <RotateCcw size={16} aria-hidden="true" />
          {translate('Reload selection')}
        </Button>
        {!locked && (
          <ConfirmAction
            label={translate('Save permissions')}
            icon={<Save size={16} />}
            disabled={!dirty || changedOnServer}
            description={
              selected.length
                ? translate(
                    'Replace this role’s permissions with your selection? This affects every staff member assigned to this role.',
                  )
                : translate(
                    'Clear all permissions from this role? Staff assigned only this role will lose access to staff and role management.',
                  )
            }
            onConfirm={async () => {
              await rolesApi.replacePermissions(role.id, { permissionKeys: selected })
              setBaseline(selected)
              setSaved(true)
              await refreshIdentity(cache)
            }}
          />
        )}
      </FormActionBar>
    </section>
  )
}
