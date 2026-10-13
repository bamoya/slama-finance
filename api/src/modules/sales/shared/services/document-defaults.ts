/** Add calendar days to a validated date-only value without local timezone/DST drift. */
export function documentDefaultDate(issueDate: string, days: number) {
  const value = new Date(`${issueDate}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function documentAppearance(
  template: {
    layout: string
    density: string
    accentColor: string
    logoAssetId: string | null
    signatureAssetId: string | null
    showBankDetails: boolean
    showSignature: boolean
    showPaymentTerms: boolean
    footerText: string | null
  } | null,
  company: { logoAssetId: string | null },
) {
  return {
    layout: template?.layout ?? 'classic',
    density: template?.density ?? 'standard',
    accentColor: template?.accentColor ?? '#ad7d1d',
    logoAssetId: template?.logoAssetId ?? company.logoAssetId,
    signatureAssetId: template?.signatureAssetId ?? null,
    showBankDetails: template?.showBankDetails ?? true,
    showSignature: template?.showSignature ?? false,
    showPaymentTerms: template?.showPaymentTerms ?? true,
    footerText: template?.footerText ?? null,
  }
}
