import { TriangleAlert } from 'lucide-react'

import type { AdminOwnerDetailRestriction } from '../../../../../api/generated/models'
import { displayDateTime } from '../../../../../lib/dates'
import { translate } from '../../../../../lib/i18n'

/** Why the customer cannot use the product. Reasons are internal notes, shown to administrators only. */
export function CustomerRestrictionBanner({
  restriction,
}: {
  restriction: AdminOwnerDetailRestriction
}) {
  if (!restriction.blockedAt && !restriction.deletionRequestedAt) return null
  return (
    <section
      aria-label={translate('Restrictions')}
      className="flex gap-3 rounded-panel border border-[var(--error-border)] bg-[var(--error-bg)] p-4 text-[var(--error-text)]"
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="space-y-3 text-sm">
        {restriction.blockedAt && (
          <div>
            <p className="font-semibold">
              {translate('Blocked since {{date}}', {
                date: displayDateTime(restriction.blockedAt),
              })}
            </p>
            {restriction.blockReason && (
              <p className="mt-1 break-words">
                {translate('Reason:')} {restriction.blockReason}
              </p>
            )}
          </div>
        )}
        {restriction.deletionRequestedAt && (
          <div>
            <p className="font-semibold">
              {restriction.deletionDueAt
                ? translate('Deletion scheduled for {{date}}', {
                    date: displayDateTime(restriction.deletionDueAt),
                  })
                : translate('Deletion scheduled')}
            </p>
            {restriction.deletionReason && (
              <p className="mt-1 break-words">
                {translate('Reason:')} {restriction.deletionReason}
              </p>
            )}
            <p className="mt-1">{translate('The deletion can be cancelled until the due date.')}</p>
          </div>
        )}
        <p className="text-xs opacity-80">
          {translate('Reasons are internal and never shown to the customer.')}
        </p>
      </div>
    </section>
  )
}
