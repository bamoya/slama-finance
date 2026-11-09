import type { AdminEntitlementOverride, EntitlementKey } from '../../../../../api/generated/models'
import { translate } from '../../../../../lib/i18n'

/** Display order and English source labels; values come from the API, never from this list. */
export const entitlementLabels: Record<EntitlementKey, string> = {
  organizations: 'Organizations',
  staffPerOrganization: 'Members per organization',
  storageBytes: 'Storage',
  businessEmails: 'Business emails per period',
  custom_templates: 'Custom templates',
  business_emails: 'Business emails',
  scheduled_reports: 'Scheduled reports',
  report_exports: 'Report exports',
  staff_roles: 'Staff roles',
  advanced_analytics: 'Advanced analytics',
  custom_domains: 'Custom domains',
}
export const entitlementKeys = Object.keys(entitlementLabels) as EntitlementKey[]
export const isLimit = (key: EntitlementKey) =>
  ['organizations', 'staffPerOrganization', 'storageBytes', 'businessEmails'].includes(key)
/** Only these counts may be unlimited (catalog definition); storage and emails stay finite. */
export const allowsUnlimited = (key: EntitlementKey) =>
  key === 'organizations' || key === 'staffPerOrganization'

const formatLimit = (key: EntitlementKey, value: number | null) =>
  value === null
    ? translate('Unlimited')
    : key === 'storageBytes'
      ? `${value / 1e9} GB`
      : String(value)

export function overrideValueLabel(
  o: Pick<
    AdminEntitlementOverride,
    'entitlementKey' | 'booleanValue' | 'integerValue' | 'unlimited'
  >,
) {
  if (o.booleanValue !== null) return translate(o.booleanValue ? 'Enabled' : 'Disabled')
  return formatLimit(o.entitlementKey, o.unlimited ? null : o.integerValue)
}

export function effectiveValueLabel(
  key: EntitlementKey,
  entitlements: {
    organizations: number | null
    staffPerOrganization: number | null
    storageBytes: number
    businessEmails: number
    features: string[]
  },
) {
  if (!isLimit(key)) return translate(entitlements.features.includes(key) ? 'Enabled' : 'Disabled')
  return formatLimit(key, entitlements[key as keyof typeof entitlements] as number | null)
}
