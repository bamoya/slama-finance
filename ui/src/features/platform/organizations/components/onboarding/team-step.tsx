import { Plus, Trash2 } from 'lucide-react'

import { Button } from '../../../../../components/ui/button'
import { Input } from '../../../../../components/ui/input'
import { Select, SelectGroup, SelectOption } from '../../../../../components/ui/select'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { useOwnerAccount } from '../../../identity/hooks/use-owner-account'
import type { OnboardingFieldsProps } from './onboarding-types'
export function TeamStep({ configuration: c, onChange }: OnboardingFieldsProps) {
  useUiLanguage()
  const owner = useOwnerAccount()
  return (
    <div className="onboarding-team">
      <div className="onboarding-owner">
        <span>{owner.firstName?.[0] ?? owner.email[0]?.toUpperCase()}</span>
        <div>
          <strong>{owner.email}</strong>
          <small>{translate('Initial administrator · independent organization account')}</small>
        </div>
      </div>
      <p className="onboarding-hint">
        {translate('You can start alone. Staff access is limited to this organization.')}
      </p>
      {c.invitations.map((invitation, index) => (
        <div className="onboarding-invitation" key={index}>
          <label className="onboarding-field">
            <span>{translate('Email address')}</span>
            <Input
              type="email"
              required
              maxLength={320}
              value={invitation.email}
              onChange={(e) =>
                onChange({
                  ...c,
                  invitations: c.invitations.map((row, i) =>
                    i === index ? { ...row, email: e.target.value } : row,
                  ),
                })
              }
            />
          </label>
          <label className="onboarding-field">
            <span>{translate('Role')}</span>
            <Select
              value={invitation.role}
              onValueChange={(v) =>
                onChange({
                  ...c,
                  invitations: c.invitations.map((row, i) =>
                    i === index ? { ...row, role: v as typeof row.role } : row,
                  ),
                })
              }
            >
              <SelectGroup>
                <SelectOption value="administrator">{translate('Administrator')}</SelectOption>
                <SelectOption value="staff">{translate('Staff')}</SelectOption>
              </SelectGroup>
            </Select>
          </label>
          <Button
            type="button"
            variant="ghost"
            size="icon-md"
            aria-label={translate('Remove invitation')}
            onClick={() =>
              onChange({ ...c, invitations: c.invitations.filter((_, i) => i !== index) })
            }
          >
            <Trash2 size={15} />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        disabled={c.invitations.length >= 25}
        onClick={() =>
          onChange({ ...c, invitations: [...c.invitations, { email: '', role: 'staff' }] })
        }
      >
        <Plus size={15} />
        {translate('Add an invitation')}
      </Button>
      <p className="onboarding-hint">
        {translate(
          'Invitations are prepared here. No email is sent before organization activation.',
        )}
      </p>
    </div>
  )
}
