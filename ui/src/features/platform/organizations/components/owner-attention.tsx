import { ArrowRight, CircleCheck, CirclePause, FolderClock, ShieldAlert } from 'lucide-react'
import { Link } from 'wouter'

import type { OwnerOrganization } from '../../../../api/generated/models'
import { Card } from '../../../../components/ui/card'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { organizationStatusLabels } from '../organization-status'

export function OwnerAttention({ organizations }: { organizations: OwnerOrganization[] }) {
  useUiLanguage()
  const attention = organizations.filter((org) => org.status !== 'active')
  return (
    <Card
      className="owner-card owner-attention"
      role="region"
      aria-labelledby="owner-attention-title"
    >
      <div className="owner-section-heading">
        <div>
          <span className="owner-eyebrow">{translate('PRIORITIES')}</span>
          <h2 id="owner-attention-title">{translate('Needs attention')}</h2>
        </div>
        <span className="owner-count">{attention.length}</span>
      </div>
      {attention.length ? (
        <ul>
          {attention.slice(0, 3).map((org) => {
            const Icon =
              org.status === 'setup'
                ? FolderClock
                : org.status === 'paused'
                  ? CirclePause
                  : ShieldAlert
            return (
              <li key={org.id}>
                <Link href={`/organizations/${org.id}${org.status === 'setup' ? '/setup' : ''}`}>
                  <span className="owner-attention-icon">
                    <Icon size={18} />
                  </span>
                  <span>
                    <strong>{org.name}</strong>
                    <small>{translate(organizationStatusLabels[org.status])}</small>
                  </span>
                  <ArrowRight size={15} />
                </Link>
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="owner-all-clear">
          <CircleCheck size={20} aria-hidden="true" />
          <div>
            <strong>{translate('No organization access issues.')}</strong>
            <p>{translate('All your organizations are active.')}</p>
          </div>
        </div>
      )}
      {attention.length > 3 && (
        <Link className="owner-text-link" href="/organizations">
          {translate('View all organizations')}
          <ArrowRight size={14} />
        </Link>
      )}
    </Card>
  )
}
