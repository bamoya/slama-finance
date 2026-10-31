import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import { createSubscriptionRepository } from '../src/modules/platform/subscriptions/repositories/subscription.repository.js'
import { createBillingService } from '../src/modules/platform/subscriptions/services/billing.service.js'
import { createSubscriptionService } from '../src/modules/platform/subscriptions/services/subscription.service.js'
import { isolatedDatabase, testOwnerId, testUserId } from './helpers/postgres.js'

const DAY = 86_400_000

describe('Manual subscription billing', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let now: Date
  let billing: ReturnType<typeof createBillingService>
  let subscriptions: ReturnType<typeof createSubscriptionService>

  beforeEach(async () => {
    fixture = await isolatedDatabase()
    now = new Date('2026-03-10T09:00:00Z')
    // Fresh trial state at the injected clock; the fixture default is a paid pro owner.
    await fixture.client`delete from subscription_payments`
    await fixture.client`update owner_subscriptions set plan_code='trial',paid_through_at=null,cancel_at_period_end=false,trial_started_at=${now.toISOString()}::timestamptz,trial_ends_at=${new Date(now.getTime() + 7 * DAY).toISOString()}::timestamptz where owner_id=${testOwnerId}`
    await fixture.client`update billing_settings set tax_rate_basis_points=2000`
    const subscriptionRepo = createSubscriptionRepository(() => fixture.db),
      billingRepo = createBillingRepository(() => fixture.db)
    billing = createBillingService(billingRepo, subscriptionRepo, () => now)
    subscriptions = createSubscriptionService(subscriptionRepo, billingRepo, () => now)
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  const request = (planCode: 'essential' | 'business' | 'pro', cycle: 'monthly' | 'annual') => ({
    planCode,
    cycle,
  })
  const pay = async (
    planCode: 'essential' | 'business' | 'pro',
    cycle: 'monthly' | 'annual' = 'monthly',
  ) => {
    const submitted = await billing.submit(testOwnerId, {
      ...request(planCode, cycle),
      method: 'bank_transfer',
      reference: `ref-${planCode}`,
    })
    return billing.confirm(submitted.id, testUserId)
  }

  it('quotes activation from trial with HT, tax and TTC snapshots', async () => {
    const quote = await billing.quote(testOwnerId, request('business', 'monthly'))
    expect(quote.kind).toBe('activation')
    expect(quote.amount).toMatchObject({
      amountHt: 29900,
      taxRateBasisPoints: 2000,
      taxAmount: 5980,
      amountTtc: 35880,
    })
    expect(quote.coverageStart).toBe(now.toISOString())
  })

  it('continues coverage without a gap when renewing during grace, and restarts after grace', async () => {
    const first = await pay('business')
    const end = new Date(first.coverageEnd!)
    now = new Date(end.getTime() + 3 * DAY)
    expect((await subscriptions.summary(testOwnerId)).status).toBe('past_due')
    const renewal = await billing.quote(testOwnerId, request('business', 'monthly'))
    expect(renewal.kind).toBe('renewal')
    expect(renewal.coverageStart).toBe(end.toISOString())
    now = new Date(end.getTime() + 8 * DAY)
    expect((await subscriptions.summary(testOwnerId)).status).toBe('expired')
    const late = await billing.quote(testOwnerId, request('business', 'monthly'))
    expect(late.kind).toBe('activation')
    expect(late.coverageStart).toBe(now.toISOString())
  })

  it('prorates an immediate upgrade over the remaining period', async () => {
    const first = await pay('business')
    const start = new Date(first.coverageStart!),
      end = new Date(first.coverageEnd!)
    now = new Date(start.getTime() + (end.getTime() - start.getTime()) / 2)
    const quote = await billing.quote(testOwnerId, request('pro', 'monthly'))
    expect(quote.kind).toBe('upgrade')
    expect(quote.amount.amountHt).toBe(
      Math.round((50000 * (end.getTime() - now.getTime())) / (end.getTime() - start.getTime())),
    )
    expect(quote.amount.amountHt).toBe(25000)
    expect(quote.coverageStart).toBe(now.toISOString())
    expect(quote.coverageEnd).toBe(end.toISOString())
    const upgrade = await pay('pro')
    expect(upgrade.kind).toBe('upgrade')
    const summary = await subscriptions.summary(testOwnerId)
    expect(summary.planCode).toBe('pro')
    expect(summary.paidThroughAt).toBe(end.toISOString())
  })

  it('rejects unknown payment methods and a second pending payment', async () => {
    await expect(
      billing.submit(testOwnerId, {
        ...request('business', 'monthly'),
        method: 'bitcoin',
        reference: 'x',
      } as never),
    ).rejects.toMatchObject({ code: 'INVALID_PAYMENT_METHOD' })
    await billing.submit(testOwnerId, {
      ...request('business', 'monthly'),
      method: 'cash',
      reference: 'first',
    })
    await expect(
      billing.submit(testOwnerId, {
        ...request('essential', 'monthly'),
        method: 'cash',
        reference: 'second',
      }),
    ).rejects.toMatchObject({ code: 'PAYMENT_PENDING' })
    expect((await subscriptions.summary(testOwnerId)).pendingPayment?.reference).toBe('first')
  })

  it('creates one coverage for concurrent duplicate confirmations and is idempotent', async () => {
    const submitted = await billing.submit(testOwnerId, {
      ...request('business', 'monthly'),
      method: 'bank_transfer',
      reference: 'dup',
    })
    now = new Date(now.getTime() + DAY)
    const results = await Promise.all([
      billing.confirm(submitted.id, testUserId),
      billing.confirm(submitted.id, testUserId),
    ])
    expect(results[0]!.coverageStart).toBe(results[1]!.coverageStart)
    expect(results[0]!.coverageEnd).toBe(results[1]!.coverageEnd)
    now = new Date(now.getTime() + DAY)
    const again = await billing.confirm(submitted.id, testUserId)
    expect(again.coverageStart).toBe(results[0]!.coverageStart)
    expect(again.coverageStart).toBe(new Date('2026-03-11T09:00:00Z').toISOString())
    const rows = await fixture.client`select id from subscription_payments where status='confirmed'`
    expect(rows).toHaveLength(1)
    const [row] =
      await fixture.client`select paid_through_at from owner_subscriptions where owner_id=${testOwnerId}`
    expect(new Date(row!.paid_through_at).toISOString()).toBe(results[0]!.coverageEnd)
  })

  it('does not allow a rejected payment to be confirmed', async () => {
    const submitted = await billing.submit(testOwnerId, {
      ...request('business', 'monthly'),
      method: 'cash',
      reference: 'bad',
    })
    await expect(billing.reject(submitted.id, testUserId, '  ')).rejects.toMatchObject({
      code: 'REJECTION_REASON_REQUIRED',
    })
    const rejected = await billing.reject(submitted.id, testUserId, 'Transfer not received')
    expect(rejected).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Transfer not received',
    })
    await expect(billing.confirm(submitted.id, testUserId)).rejects.toMatchObject({
      code: 'PAYMENT_REJECTED',
    })
    expect((await subscriptions.summary(testOwnerId)).pendingPayment).toBeNull()
    expect(
      await fixture.client`select 1 from subscription_payments where status='confirmed'`,
    ).toHaveLength(0)
  })

  it('keeps paid coverage when cancelled but removes grace', async () => {
    const paid = await pay('business')
    const end = new Date(paid.coverageEnd!)
    await billing.setCancellation(testOwnerId, true)
    const during = await subscriptions.summary(testOwnerId)
    expect(during).toMatchObject({
      status: 'active',
      cancelAtPeriodEnd: true,
      planCode: 'business',
      graceEndsAt: null,
    })
    now = new Date(end.getTime() - 1000)
    expect((await subscriptions.summary(testOwnerId)).status).toBe('active')
    now = end
    const after = await subscriptions.summary(testOwnerId)
    expect(after.status).toBe('expired')
    expect(after.graceEndsAt).toBeNull()
    expect(after.blockedAt).toBe(end.toISOString())
  })

  it('keeps the tax snapshot after billing settings change', async () => {
    const submitted = await billing.submit(testOwnerId, {
      ...request('business', 'monthly'),
      method: 'cash',
      reference: 'tax',
    })
    await fixture.client`update billing_settings set tax_rate_basis_points=1000`
    const confirmed = await billing.confirm(submitted.id, testUserId)
    expect(confirmed.amount).toMatchObject({
      amountHt: 29900,
      taxRateBasisPoints: 2000,
      taxAmount: 5980,
      amountTtc: 35880,
    })
    const quote = await billing.quote(testOwnerId, request('business', 'monthly'))
    expect(quote.amount.taxRateBasisPoints).toBe(1000)
  })

  it('applies a downgrade renewal only at the paid boundary', async () => {
    const first = await pay('pro')
    const end = new Date(first.coverageEnd!)
    now = new Date(end.getTime() - 5 * DAY)
    const quote = await billing.quote(testOwnerId, request('essential', 'monthly'))
    expect(quote.kind).toBe('renewal')
    expect(quote.coverageStart).toBe(end.toISOString())
    const downgrade = await pay('essential')
    expect(downgrade.coverageStart).toBe(end.toISOString())
    const before = await subscriptions.summary(testOwnerId)
    expect(before.planCode).toBe('pro')
    expect(before.nextPlanCode).toBe('essential')
    now = new Date(end.getTime() + DAY)
    const after = await subscriptions.summary(testOwnerId)
    expect(after.planCode).toBe('essential')
    expect(after.status).toBe('active')
  })
})
