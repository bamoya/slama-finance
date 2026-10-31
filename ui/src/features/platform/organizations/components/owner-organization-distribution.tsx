import type { OwnerOrganization } from '../../../../api/generated/models'
import { Card } from '../../../../components/ui/card'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { organizationStatusLabels } from '../organization-status'

export function OwnerOrganizationDistribution({
  organizations,
}: {
  organizations: OwnerOrganization[]
}) {
  useUiLanguage()
  const states = Object.entries(organizationStatusLabels)
    .map(([status, label]) => ({
      status,
      label,
      count: organizations.filter((org) => org.status === status).length,
    }))
    .filter((item) => item.count > 0)
  let offset = 0
  const circumference = 2 * Math.PI * 52
  return (
    <Card
      className="owner-card owner-distribution"
      role="region"
      aria-labelledby="owner-distribution-title"
    >
      <div className="owner-section-heading">
        <div>
          <span className="owner-eyebrow">{translate('YOUR PORTFOLIO')}</span>
          <h2 id="owner-distribution-title">{translate('Organization availability')}</h2>
        </div>
      </div>
      <div className="owner-donut">
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r="52" className="owner-donut-track" />
          {states.map((item) => {
            const length = (item.count / organizations.length) * circumference
            const current = offset
            offset += length
            return (
              <circle
                key={item.status}
                cx="80"
                cy="80"
                r="52"
                pathLength={circumference}
                className={`owner-status-stroke owner-status-${item.status}`}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-current}
                transform="rotate(-90 80 80)"
              />
            )
          })}
        </svg>
        <div>
          <strong>{organizations.length}</strong>
          <span>{translate('Organizations')}</span>
        </div>
      </div>
      <ul className="owner-status-legend">
        {states.map((item) => (
          <li key={item.status}>
            <i className={`owner-status-fill owner-status-${item.status}`} />
            <span>{translate(item.label)}</span>
            <strong>{item.count}</strong>
          </li>
        ))}
      </ul>
      {!organizations.length && (
        <p className="owner-muted">{translate('Your organization overview will appear here.')}</p>
      )}
    </Card>
  )
}
