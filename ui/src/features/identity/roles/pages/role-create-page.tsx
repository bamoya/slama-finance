import { useQueryClient } from '@tanstack/react-query'
import { Link, useLocation } from 'wouter'

import { CreateRoleSchema } from '../../../../api/generated/schemas/identity/rbac.schemas'
import { PageHeader } from '../../../../components/management/page-header'
import { TextRecordForm } from '../../../../components/management/text-record-form'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { refreshIdentity, useRoleActions } from '../../shared/queries'
export function RoleCreatePage() {
  useUiLanguage()

  const rolesApi = useRoleActions()

  const cache = useQueryClient()
  const [, navigate] = useLocation()
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link href="/settings/roles" className="text-sm font-semibold text-[var(--muted)]">
        {translate('← Back to roles')}
      </Link>
      <PageHeader
        eyebrow={translate('Administration / Roles')}
        title={translate('Create a role')}
        description={translate(
          'Create the role first, then configure its permissions. New roles start with no permissions.',
        )}
      />
      <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
        <TextRecordForm
          schema={CreateRoleSchema}
          submitLabel={translate('Create role')}
          cancelHref="/settings/roles"
          fields={[
            {
              name: 'name',
              label: translate('Role name'),
              get hint() {
                return translate('For example: Sales team')
              },
            },
            {
              name: 'key',
              label: translate('Role key'),
              get hint() {
                return translate('Lowercase letters, numbers and hyphens; for example sales-team.')
              },
            },
            {
              name: 'description',
              label: translate('Description'),
              get hint() {
                return translate('Optional. Explain who this role is for.')
              },
            },
          ]}
          onSubmit={async (value) => {
            const role = await rolesApi.create(CreateRoleSchema.parse(value))
            await refreshIdentity(cache)
            navigate(`/settings/roles/${role.id}`)
          }}
        />
      </section>
    </div>
  )
}
