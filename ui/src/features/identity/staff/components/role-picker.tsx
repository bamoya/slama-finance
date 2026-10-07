import type { Role } from '../../../../api/generated/schemas/identity/rbac.schemas'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { hasPermission } from '../../auth/permissions'
export function RolePicker({
  roles,
  selected,
  onChange,
  allowedKeys,
  disabled = false,
}: {
  roles: Role[]
  selected: string[]
  onChange: (ids: string[]) => void
  allowedKeys: string[]
  disabled?: boolean
}) {
  useUiLanguage()

  return (
    <fieldset disabled={disabled} className="space-y-3">
      <legend className="mb-3 font-semibold">{translate('Assigned roles')}</legend>
      {!roles.length && (
        <p className="text-sm text-[var(--muted)]">
          {translate('No roles are available. Create a role in Roles & permissions first.')}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {roles.map((role) => {
          const blocked = role.permissionKeys.some((key) => !hasPermission(allowedKeys, key))
          return (
            <label
              key={role.id}
              title={
                blocked
                  ? translate('Contains permissions you cannot grant.')
                  : role.description || `${role.permissionKeys.length} permissions`
              }
              className={`relative flex min-h-control min-w-28 items-center justify-center gap-2 rounded-control border px-3 py-2 focus-within:ring-2 focus-within:ring-[var(--accent)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--surface)] ${blocked || disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${selected.includes(role.id) ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)]'}`}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={selected.includes(role.id)}
                disabled={blocked}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...selected, role.id]
                      : selected.filter((id) => id !== role.id),
                  )
                }
              />
              <span>
                <strong className="block text-sm">{role.name}</strong>
                <span className="sr-only">
                  {blocked
                    ? translate('Contains permissions you cannot grant.')
                    : role.description || `${role.permissionKeys.length} permissions`}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      <p className="text-sm text-[var(--muted)]">
        {translate(
          'Permissions are inherited from roles. No roles means no staff or role-management permissions.',
        )}
      </p>
    </fieldset>
  )
}
