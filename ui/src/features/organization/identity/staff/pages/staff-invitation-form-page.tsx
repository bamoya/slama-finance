import { useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation } from 'wouter'

import {
  getListStaffInvitationsQueryKey,
  useCreateStaffInvitation,
} from '../../../../../api/generated/identity/identity'
import { CreateStaffInvitationSchema } from '../../../../../api/generated/schemas/identity/staff-invitations.schemas'
import { FormError } from '../../../../../components/management/form-error'
import { PageHeader } from '../../../../../components/management/page-header'
import { RequestState } from '../../../../../components/management/request-state'
import { Button, buttonVariants } from '../../../../../components/ui/button'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { Select, SelectOption } from '../../../../../components/ui/select'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { Can } from '../../auth/components/can'
import { useAuthorization } from '../../auth/hooks/use-authorization'
import { useSession } from '../../auth/hooks/use-session'
import { useRoles } from '../../shared/queries'
import { RolePicker } from '../components/role-picker'

export function StaffInvitationFormPage() {
  useUiLanguage()
  const [, navigate] = useLocation(),
    cache = useQueryClient(),
    { can } = useAuthorization(),
    session = useSession()
  const roles = useRoles(can('roles.read') && can('roles.update')),
    create = useCreateStaffInvitation()
  const [email, setEmail] = useState(''),
    [roleIds, setRoleIds] = useState<string[]>([]),
    [language, setLanguage] = useState('fr'),
    [error, setError] = useState<unknown>(null)
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader
        eyebrow={translate('Staff invitations')}
        title={translate('Invite a staff member')}
        description={translate(
          'The recipient chooses their own password. Access is limited to this organization.',
        )}
        actions={
          <>
            <Link
              href="/settings/staff/invitations"
              className={buttonVariants({ variant: 'outline' })}
            >
              {translate('Back')}
            </Link>
            <Can permission="staff.create">
              <Button type="submit" form="staff-invitation" disabled={create.isPending}>
                <Send size={17} />
                {translate('Send invitation')}
              </Button>
            </Can>
          </>
        }
      />
      <form
        id="staff-invitation"
        className="grid gap-content rounded-panel border border-border bg-card p-panel"
        onSubmit={async (event) => {
          event.preventDefault()
          setError(null)
          try {
            const data = CreateStaffInvitationSchema.parse({
              email: email.trim(),
              roleIds,
              language,
            })
            await create.mutateAsync({ data })
            await cache.invalidateQueries({ queryKey: getListStaffInvitationsQueryKey() })
            navigate('/settings/staff/invitations')
          } catch (reason) {
            setError(reason)
          }
        }}
      >
        <FormError error={error} />
        <div className="grid gap-content md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="invite-email">{translate('Email address')}</Label>
            <Input
              id="invite-email"
              type="email"
              required
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invite-language">{translate('Email language')}</Label>
            <Select id="invite-language" value={language} onValueChange={setLanguage}>
              <SelectOption value="fr">Français</SelectOption>
              <SelectOption value="en">English</SelectOption>
            </Select>
          </div>
        </div>
        <Can permission={['roles.read', 'roles.update']}>
          {roles.isPending || roles.isError ? (
            <RequestState query={roles} />
          ) : (
            <RolePicker
              roles={roles.data ?? []}
              selected={roleIds}
              onChange={setRoleIds}
              allowedKeys={session.data?.permissionKeys ?? []}
            />
          )}
        </Can>
        {!(can('roles.read') && can('roles.update')) && (
          <p className="text-sm text-muted-foreground">
            {translate(
              'Without a role, a member has no operational permissions. Assign roles to grant access.',
            )}
          </p>
        )}
      </form>
    </div>
  )
}
