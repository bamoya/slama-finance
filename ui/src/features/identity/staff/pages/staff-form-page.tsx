import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'wouter'

import {
  CreateStaffSchema,
  type StaffDetail,
  type StaffOnboarding,
  UpdateStaffSchema,
} from '../../../../api/generated/schemas/identity/staff.schemas'
import { PageHeader } from '../../../../components/management/page-header'
import { EmptyState } from '../../../../components/management/page-state'
import { RequestState } from '../../../../components/management/request-state'
import { TextRecordForm } from '../../../../components/management/text-record-form'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { useAuthorization } from '../../auth/hooks/use-authorization'
import { useSession } from '../../auth/hooks/use-session'
import {
  identityKeys,
  refreshIdentity,
  useRoles,
  useStaff,
  useStaffActions,
} from '../../shared/queries'
import { RolePicker } from '../components/role-picker'
import { TemporaryCredential } from '../components/temporary-credential'
const fields = [
  {
    name: 'firstName',
    get label() {
      return translate('First name')
    },
  },
  {
    name: 'lastName',
    get label() {
      return translate('Family name')
    },
  },
  {
    name: 'email',
    get label() {
      return translate('Email address')
    },
    type: 'email' as const,
  },
]
export function StaffFormPage() {
  useUiLanguage()

  const { staffId } = useParams<{ staffId?: string }>()
  const staff = useStaff(staffId ?? '')
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <Link
        href={staffId ? `/settings/staff/${staffId}` : '/settings/staff'}
        className="text-sm font-semibold text-[var(--muted)]"
      >
        {translate('← Back to staff')}
      </Link>
      <PageHeader
        eyebrow={translate('Administration / Staff')}
        title={staffId ? translate('Edit staff profile') : translate('Add a staff member')}
        description={
          staffId
            ? translate('Update account details. Roles and account access are managed separately.')
            : translate(
                'Create an account with a one-use temporary password. Share the password securely after saving.',
              )
        }
      />
      {staffId ? (
        staff.isPending || staff.isError ? (
          <RequestState query={staff} />
        ) : staff.data.archivedAt ? (
          <EmptyState
            title={translate('Archived account')}
            description={translate('Archived accounts cannot be changed.')}
          />
        ) : (
          <EditProfile key={staffId} person={staff.data} />
        )
      ) : (
        <CreateStaff />
      )}
    </div>
  )
}
function EditProfile({ person }: { person: StaffDetail }) {
  useUiLanguage()

  const staffApi = useStaffActions()

  const cache = useQueryClient()
  const [, navigate] = useLocation()
  return (
    <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
      <TextRecordForm
        fields={fields}
        initial={{
          firstName: person.firstName ?? '',
          lastName: person.lastName ?? '',
          email: person.email,
        }}
        schema={UpdateStaffSchema}
        submitLabel={translate('Save profile')}
        cancelHref={`/settings/staff/${person.id}`}
        onSubmit={async (value) => {
          await staffApi.update(person.id, UpdateStaffSchema.parse(value))
          await refreshIdentity(cache)
          navigate(`/settings/staff/${person.id}`)
        }}
      />
    </section>
  )
}
function CreateStaff() {
  useUiLanguage()

  const { can: hasAccess } = useAuthorization()

  const staffApi = useStaffActions()

  const session = useSession()
  const canReadRoles = !!hasAccess('roles.read') && hasAccess('roles.update')
  const roles = useRoles(canReadRoles)
  const [roleIds, setRoleIds] = useState<string[]>([])
  const [created, setCreated] = useState<StaffOnboarding | null>(null)
  const cache = useQueryClient()
  const [, navigate] = useLocation()
  return (
    <>
      {canReadRoles && (roles.isPending || roles.isError) && <RequestState query={roles} />}
      <section className="rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
        <TextRecordForm
          fields={fields}
          schema={CreateStaffSchema}
          submitLabel={translate('Create staff account')}
          cancelHref="/settings/staff"
          disabled={!!created || (canReadRoles && (roles.isPending || roles.isError))}
          onSubmit={async (value) => {
            // Keep the one-time credential out of Query and mutation caches.
            const result = await staffApi.create(CreateStaffSchema.parse({ ...value, roleIds }))
            setCreated(result)
            await cache.invalidateQueries({ queryKey: identityKeys.staff })
          }}
        >
          {canReadRoles ? (
            roles.isPending || roles.isError ? (
              <p className="text-sm text-[var(--muted)]">
                {translate('Load the role catalog before creating an account.')}
              </p>
            ) : (
              <RolePicker
                roles={roles.data}
                selected={roleIds}
                onChange={setRoleIds}
                allowedKeys={session.data?.permissionKeys ?? []}
              />
            )
          ) : (
            <p className="text-sm text-[var(--muted)]">
              {translate(
                'You need View and Edit permissions for roles to select them. This account will be created without roles; an administrator can assign them later.',
              )}
            </p>
          )}
          <p className="rounded-xl bg-[var(--surface-muted)] p-4 text-sm text-[var(--muted)]">
            {translate(
              'A temporary password is generated automatically and expires after 24 hours. It is displayed once; no invitation email is sent.',
            )}
          </p>
        </TextRecordForm>
      </section>
      {created && (
        <TemporaryCredential
          email={created.email}
          credential={created}
          onDismiss={() => {
            const id = created.id
            setCreated(null)
            navigate(`/settings/staff/${id}`)
          }}
        />
      )}
    </>
  )
}
