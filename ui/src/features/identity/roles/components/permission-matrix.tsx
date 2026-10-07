import { Info } from 'lucide-react'

import type { Permission } from '../../../../api/generated/schemas/identity/rbac.schemas'
import { Button } from '../../../../components/ui/button'
import { Switch } from '../../../../components/ui/switch'
import { Tooltip } from '../../../../components/ui/tooltip'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { hasPermission } from '../../auth/permissions'

function coordinates(key: string) {
  const dot = key.lastIndexOf('.')
  return dot < 0
    ? { module: 'Other', action: key }
    : { module: key.slice(0, dot), action: key.slice(dot + 1) }
}

export function PermissionMatrix({
  permissions,
  selected,
  allowedKeys,
  disabled,
  onChange,
}: {
  permissions: Permission[]
  selected: string[]
  allowedKeys: string[]
  disabled: boolean
  onChange: (keys: string[]) => void
}) {
  const language = useUiLanguage()

  const rows = [...new Set(permissions.map((item) => coordinates(item.key).module))].sort()
  const columns = ['read', 'create', 'update', 'delete'] as const
  const labels = { read: 'View', create: 'Create', update: 'Edit', delete: 'Delete' }
  const hints = {
    read: 'View records and download existing documents. Reports uses a single access permission.',
    create: 'Create records, copies and revisions. Conversion also requires access to the source.',
    update:
      'Edit records and change their state: archive, restore, enable, disable, issue, send, cancel or regenerate PDFs. Business restrictions still apply.',
    delete:
      'Permanently delete records only when allowed. This does not include archiving or cancellation.',
  }
  const cells = new Map(
    permissions.map((item) => {
      const { module, action } = coordinates(item.key)
      return [JSON.stringify([module, action]), item]
    }),
  )
  if (!permissions.length)
    return (
      <p className="p-panel text-sm text-[var(--muted)]">
        {translate('No permissions are available.')}
      </p>
    )
  return (
    <div className="overflow-x-auto">
      <table data-slot="data-table" className="w-full min-w-[420px] text-sm">
        <caption className="sr-only">
          {translate('Role permission matrix: modules by action')}
        </caption>
        <thead className="bg-[var(--surface-muted)] text-[var(--muted)]">
          <tr>
            <th scope="col" className="p-5 text-left">
              {translate('Module')}
            </th>
            {columns.map((action) => (
              <th scope="col" key={action} className="p-3 text-center">
                <div className="flex items-center justify-center gap-1">
                  {translate(labels[action])}
                  <Tooltip label={translate(hints[action])}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={translate(hints[action])}
                    >
                      <Info aria-hidden="true" />
                    </Button>
                  </Tooltip>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {rows.map((module) => (
            <tr key={module}>
              <th scope="row" className="p-5 text-left font-semibold capitalize">
                {translate(module.replaceAll('.', ' ').replaceAll('_', ' '))}
              </th>
              {columns.map((action) => {
                const permission = cells.get(JSON.stringify([module, action]))
                return (
                  <td key={action} className="p-3 text-center">
                    {permission ? (
                      <Switch
                        aria-label={
                          language === 'en'
                            ? permission.description || permission.key
                            : `${translate(module.replaceAll('_', ' '))} — ${translate(labels[action])}`
                        }
                        title={
                          permission.key +
                          (!hasPermission(allowedKeys, permission.key)
                            ? ` — ${translate('You cannot grant this permission')}`
                            : '')
                        }
                        checked={selected.includes(permission.key)}
                        disabled={disabled || !hasPermission(allowedKeys, permission.key)}
                        onCheckedChange={(checked) =>
                          onChange(
                            checked
                              ? [...selected, permission.key]
                              : selected.filter((key) => key !== permission.key),
                          )
                        }
                      />
                    ) : (
                      <span aria-label={translate('Not available')} className="text-[var(--muted)]">
                        —
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t border-[var(--border)] px-5 py-3 text-xs text-[var(--muted)]">
        {translate(
          '— Not available. Only permissions defined by the API are shown; permissions you cannot grant are disabled.',
        )}
      </p>
    </div>
  )
}
