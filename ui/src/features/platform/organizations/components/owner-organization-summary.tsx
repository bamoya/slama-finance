import { ArrowRight, Building2, Users } from 'lucide-react'

import type { OwnerOrganization } from '../../../../api/generated/models'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { organizationLoginUrl } from '../../../../lib/platform-sites'
import { OrganizationStatus } from './organization-status'

/** Platform ownership does not establish a staff session; active organizations open their login. */
export function OwnerOrganizationSummary({ organization }: { organization: OwnerOrganization }) {
  useUiLanguage()
  return (
    <a
      href={
        organization.status === 'active'
          ? organizationLoginUrl(organization.slug)
          : `/organizations/${organization.id}${organization.status === 'setup' ? '/setup' : ''}`
      }
      className="owner-org-summary"
    >
      <span className="owner-org-avatar" aria-hidden="true">
        <Building2 size={19} />
      </span>
      <span className="owner-org-identity">
        <strong>{organization.name}</strong>
        <small>{organization.slug}</small>
      </span>
      <OrganizationStatus status={organization.status} />
      <span className="owner-org-staff">
        <Users size={14} />
        {organization.staffCount}
        <span className="sr-only">{translate('Members')}</span>
      </span>
      <span className="owner-org-open">
        {translate(
          organization.status === 'setup'
            ? 'Resume setup'
            : organization.status === 'active'
              ? 'Open organization'
              : 'View details',
        )}
        <ArrowRight size={15} />
      </span>
    </a>
  )
}
