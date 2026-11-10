import { describe, expect, it } from 'vitest'

import {
  accessDeadline,
  type BillingState,
} from '../src/modules/platform/subscriptions/services/access-resolver.service.js'

const at = new Date('2026-03-30T12:00:00Z')
const state = (over: Partial<BillingState> = {}) =>
  ({
    row: { trialEndsAt: new Date('2026-03-01T00:00:00Z') },
    coverage: [
      {
        planCode: 'pro',
        planVersionId: 'v',
        cycle: 'monthly',
        start: new Date('2026-03-10T00:00:00Z'),
        end: new Date('2026-04-10T00:00:00Z'),
      },
    ],
    status: 'active',
    planCode: 'pro',
    graceEndsAt: null,
    paidThroughAt: new Date('2026-04-10T00:00:00Z'),
    ...over,
  }) as unknown as BillingState
const snapshot = (over: { overrides?: unknown[]; scheduled?: unknown[] } = {}) =>
  ({ periods: [], suspensions: [], scheduled: [], overrides: [], ...over }) as never
const override = (startsAt: string, endsAt: string | null, revokedAt: string | null = null) => ({
  entitlementKey: 'storageBytes',
  booleanValue: null,
  integerValue: 1,
  isUnlimited: false,
  startsAt: new Date(startsAt),
  endsAt: endsAt ? new Date(endsAt) : null,
  revokedAt: revokedAt ? new Date(revokedAt) : null,
  createdAt: new Date(startsAt),
})

describe('accessValidUntil', () => {
  it('is the next Casablanca month boundary when nothing earlier changes', () => {
    // 2026-04-01 00:00 Africa/Casablanca, computed from IANA data (never a fixed offset).
    const deadline = accessDeadline(at, state(), snapshot())!
    expect(deadline.getTime()).toBeLessThan(new Date('2026-04-10T00:00:00Z').getTime())
    expect(deadline.getTime()).toBeGreaterThan(at.getTime())
  })
  it('takes the earliest override start or effective end (revocation wins over planned end)', () => {
    expect(
      accessDeadline(
        at,
        state(),
        snapshot({ overrides: [override('2026-03-31T08:00:00Z', null)] }),
      )!.toISOString(),
    ).toBe('2026-03-31T08:00:00.000Z')
    expect(
      accessDeadline(
        at,
        state(),
        snapshot({
          overrides: [
            override('2026-03-01T00:00:00Z', '2026-03-31T10:00:00Z', '2026-03-30T18:00:00Z'),
          ],
        }),
      )!.toISOString(),
    ).toBe('2026-03-30T18:00:00.000Z')
  })
  it('ignores boundaries at or before the instant and scheduled changes no longer scheduled', () => {
    const exact = override('2026-03-01T00:00:00Z', at.toISOString())
    const deadline = accessDeadline(
      at,
      state(),
      snapshot({
        overrides: [exact],
        scheduled: [
          { kind: 'cancel', status: 'cancelled', effectiveAt: new Date('2026-03-30T13:00:00Z') },
          { kind: 'cancel', status: 'scheduled', effectiveAt: new Date('2026-03-30T14:00:00Z') },
        ],
      }),
    )!
    expect(deadline.toISOString()).toBe('2026-03-30T14:00:00.000Z')
  })
  it('freezes coverage during a suspension: only override boundaries remain', () => {
    expect(accessDeadline(at, state({ status: 'suspended' }), snapshot())).toBeNull()
    expect(
      accessDeadline(
        at,
        state({ status: 'suspended' }),
        snapshot({ overrides: [override('2026-05-01T00:00:00Z', null)] }),
      )!.toISOString(),
    ).toBe('2026-05-01T00:00:00.000Z')
  })
  it('reports grace and trial ends', () => {
    const lapsed = state({
      status: 'past_due',
      coverage: [],
      paidThroughAt: new Date('2026-03-29T00:00:00Z'),
      graceEndsAt: new Date('2026-04-05T00:00:00Z'),
      planCode: 'pro',
    })
    expect(accessDeadline(at, lapsed, snapshot())!.getTime()).toBeLessThanOrEqual(
      new Date('2026-04-05T00:00:00Z').getTime(),
    )
    const trial = state({
      status: 'trial',
      planCode: 'trial',
      coverage: [],
      paidThroughAt: null,
      row: { trialEndsAt: new Date('2026-04-02T00:00:00Z') } as never,
    })
    expect(accessDeadline(at, trial, snapshot())!.toISOString()).toBe('2026-04-02T00:00:00.000Z')
  })
})
