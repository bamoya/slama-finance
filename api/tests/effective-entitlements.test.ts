import { describe, expect, it } from 'vitest'

import {
  effectiveEntitlements,
  type OverrideValue,
} from '../src/modules/platform/subscriptions/services/effective-entitlements.js'

const plan = {
  organizations: 1,
  staffPerOrganization: 1,
  storageBytes: 1_000_000_000,
  businessEmails: 0,
  features: [] as never[],
}
const t = (iso: string) => new Date(iso)
const override = (o: Partial<OverrideValue>): OverrideValue => ({
  entitlementKey: 'staffPerOrganization',
  booleanValue: null,
  integerValue: 5,
  isUnlimited: false,
  startsAt: t('2026-12-01T00:00:00Z'),
  endsAt: t('2027-01-01T00:00:00Z'),
  revokedAt: null,
  ...o,
})
const staffAt = (o: OverrideValue[], at: string) =>
  effectiveEntitlements(plan, o, t(at)).entitlements.staffPerOrganization

describe('effective owner-subscription entitlements', () => {
  it('applies the half-open window [start, end) at exact boundary instants', () => {
    const o = [override({})]
    expect(staffAt(o, '2026-11-30T23:59:59.999Z')).toBe(1)
    expect(staffAt(o, '2026-12-01T00:00:00.000Z')).toBe(5)
    expect(staffAt(o, '2026-12-31T23:59:59.999Z')).toBe(5)
    expect(staffAt(o, '2027-01-01T00:00:00.000Z')).toBe(1)
  })

  it('ends at revocation while keeping earlier enforcement, and ignores revoked future records', () => {
    const revoked = [override({ revokedAt: t('2026-12-10T00:00:00Z') })]
    expect(staffAt(revoked, '2026-12-09T23:59:59.999Z')).toBe(5)
    expect(staffAt(revoked, '2026-12-10T00:00:00.000Z')).toBe(1)
    const cancelled = [override({ revokedAt: t('2026-11-15T00:00:00Z') })]
    expect(staffAt(cancelled, '2026-12-05T00:00:00Z')).toBe(1)
  })

  it('replaces values rather than adding, supports unlimited counts and feature removal', () => {
    const pro = { ...plan, features: ['business_emails', 'report_exports'] as never[] }
    const result = effectiveEntitlements(
      pro,
      [
        override({
          entitlementKey: 'organizations',
          integerValue: null,
          isUnlimited: true,
          endsAt: null,
        }),
        override({ entitlementKey: 'businessEmails', integerValue: 300 }),
        override({ entitlementKey: 'business_emails', integerValue: null, booleanValue: false }),
        override({ entitlementKey: 'custom_domains', integerValue: null, booleanValue: true }),
      ],
      t('2026-12-15T00:00:00Z'),
    )
    expect(result.entitlements).toEqual({
      organizations: null,
      staffPerOrganization: 1,
      storageBytes: 1_000_000_000,
      businessEmails: 300,
      features: ['report_exports', 'custom_domains'],
    })
    expect(result.sources.find((s) => s.entitlementKey === 'organizations')).toEqual({
      entitlementKey: 'organizations',
      source: 'override',
      effectiveUntil: null,
    })
    expect(result.sources.find((s) => s.entitlementKey === 'businessEmails')?.effectiveUntil).toBe(
      '2027-01-01T00:00:00.000Z',
    )
    expect(result.sources.find((s) => s.entitlementKey === 'storageBytes')?.source).toBe('plan')
  })

  it('fails closed on malformed records instead of granting', () => {
    const at = '2026-12-15T00:00:00Z'
    const result = effectiveEntitlements(
      plan,
      [
        override({ entitlementKey: 'storageBytes', integerValue: null, isUnlimited: true }),
        override({ entitlementKey: 'organizations', integerValue: 0 }),
        override({ entitlementKey: 'unknown_key' }),
        override({ entitlementKey: 'custom_domains', booleanValue: null }),
      ],
      t(at),
    )
    expect(result.entitlements).toEqual(plan)
    expect(result.sources.every((s) => s.source === 'plan')).toBe(true)
  })
})
