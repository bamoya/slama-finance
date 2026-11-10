import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { tenantDatabase } from '../src/lib/tenant-database.js'
import { createTenantWorkerRunner } from '../src/lib/tenant-workers.js'
import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import { createSubscriptionRepository } from '../src/modules/platform/subscriptions/repositories/subscription.repository.js'
import { createBillingService } from '../src/modules/platform/subscriptions/services/billing.service.js'
import { createSubscriptionService } from '../src/modules/platform/subscriptions/services/subscription.service.js'
import {
  isolatedDatabase,
  publishPlanVersion,
  testOrganizationId,
  testOwnerId,
  testUserId,
} from './helpers/postgres.js'

const DAY = 86_400_000

describe('S2/S4 version pins and the effective-access resolver', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let now: Date
  let billing: ReturnType<typeof createBillingService>
  let subscriptions: ReturnType<typeof createSubscriptionService>
  // A fresh service has an empty immutable-version cache (a new process).
  const fresh = () => {
    const subscriptionRepo = createSubscriptionRepository(() => fixture.db),
      billingRepo = createBillingRepository(() => fixture.db)
    billing = createBillingService(billingRepo, subscriptionRepo, () => now)
    subscriptions = createSubscriptionService(subscriptionRepo, billingRepo, () => now)
  }

  beforeEach(async () => {
    fixture = await isolatedDatabase({ owner: 'trial' })
    now = new Date('2026-03-10T09:00:00Z')
    await fixture.client`update owner_subscriptions set trial_started_at=${now.toISOString()}::timestamptz,trial_ends_at=${new Date(now.getTime() + 7 * DAY).toISOString()}::timestamptz where owner_id=${testOwnerId}`
    fresh()
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  const pay = async (planCode: 'essential' | 'business' | 'pro', reference: string) => {
    const submitted = await billing.submit(testOwnerId, {
      planCode,
      cycle: 'monthly',
      method: 'bank_transfer',
      reference,
    })
    return billing.confirm(submitted.id, testUserId)
  }
  const periodPins = async () =>
    (
      await fixture.client`select v.version_number n from subscription_periods p join plan_versions v on v.id=p.plan_version_id where p.owner_id=${testOwnerId} and p.kind<>'trial' order by p.starts_at`
    ).map((r) => r.n)
  const transition = (target: string, notice: Date, effective: Date) =>
    fixture.client`insert into subscription_scheduled_changes(owner_id,kind,effective_at,target_plan_code,target_plan_version_id,notice_sent_at,created_by)
      values (${testOwnerId},'version_transition',${effective.toISOString()},'essential',${target},${notice.toISOString()},'migration') returning id`

  it('reads values and prices only from the pinned version, never the plan JSON or price columns', async () => {
    const before = await billing.quote(testOwnerId, { planCode: 'business', cycle: 'monthly' })
    const catalog = await billing.catalog(testOwnerId)
    const trial = await subscriptions.summary(testOwnerId)
    await fixture.client`update subscription_plans set monthly_ht=1, annual_ht=2, entitlements=jsonb_set(entitlements,'{storageBytes}','1')`
    fresh()
    expect(await billing.quote(testOwnerId, { planCode: 'business', cycle: 'monthly' })).toEqual(
      before,
    )
    expect(await billing.catalog(testOwnerId)).toEqual(catalog)
    expect((await subscriptions.summary(testOwnerId)).entitlements).toEqual(trial.entitlements)
    expect(before.planVersionNumber).toBe(1)
    expect(trial.planVersionNumber).toBe(1)
    expect(catalog.plans.map((p) => [p.code, p.versionNumber])).toEqual([
      ['essential', 1],
      ['business', 1],
      ['pro', 1],
    ])
  })

  it('keeps purchased pins through publication, selection and withdrawal; new sales use the selling version', async () => {
    const paid = await pay('essential', 'v1')
    expect(paid.planVersionNumber).toBe(1)
    const v1Price = paid.amount.amountHt
    await publishPlanVersion(fixture.client, 'essential', {
      values: { staffPerOrganization: 7 },
      priceDelta: 500,
    })
    fresh()
    const s = await subscriptions.summary(testOwnerId)
    expect(s.planVersionNumber).toBe(1)
    expect(s.entitlements.staffPerOrganization).not.toBe(7)
    // Same-plan renewal (either cycle) keeps the pin and its price.
    const renewal = await billing.quote(testOwnerId, { planCode: 'essential', cycle: 'monthly' })
    expect(renewal).toMatchObject({ kind: 'renewal', planVersionNumber: 1 })
    expect(renewal.amount.amountHt).toBe(v1Price)
    expect(
      (await billing.quote(testOwnerId, { planCode: 'essential', cycle: 'annual' }))
        .planVersionNumber,
    ).toBe(1)
    // The catalog advertises the selling version.
    const catalog = await billing.catalog(testOwnerId)
    expect(catalog.plans.find((p) => p.code === 'essential')).toMatchObject({
      versionNumber: 2,
      monthlyHt: v1Price + 500,
    })
    // Withdrawal: omitted from the catalog, new sales refused, renewal on the pin continues.
    await fixture.client`update plan_selling set plan_version_id=null,changed_by='test:operator' where plan_code='pro'`
    expect((await billing.catalog(testOwnerId)).plans.map((p) => p.code)).not.toContain('pro')
    await expect(
      billing.quote(testOwnerId, { planCode: 'pro', cycle: 'monthly' }),
    ).rejects.toMatchObject({ code: 'PLAN_NOT_SELLABLE', statusCode: 409 })
    await fixture.client`update plan_selling set plan_version_id=null,changed_by='test:operator' where plan_code='essential'`
    const renewed = await pay('essential', 'renewal-on-pin')
    expect(renewed).toMatchObject({ kind: 'renewal', planVersionNumber: 1 })
    expect(await periodPins()).toEqual([1, 1])
  })

  it('honors the quoted pin at confirmation even if the selling version moved meanwhile', async () => {
    const submitted = await billing.submit(testOwnerId, {
      planCode: 'business',
      cycle: 'monthly',
      method: 'bank_transfer',
      reference: 'race',
    })
    expect(submitted.planVersionNumber).toBe(1)
    await publishPlanVersion(fixture.client, 'business', { priceDelta: 1000 })
    const confirmed = await billing.confirm(submitted.id, testUserId)
    expect(confirmed).toMatchObject({ planVersionNumber: 1, amount: submitted.amount })
    expect(await periodPins()).toEqual([1])
    expect((await subscriptions.summary(testOwnerId)).planVersionNumber).toBe(1)
  })

  it('moves a renewal to a new version only through an eligible notified transition, atomically applied', async () => {
    const first = await pay('essential', 'first')
    const end = new Date(first.coverageEnd!)
    const v2 = await publishPlanVersion(fixture.client, 'essential', { priceDelta: 700 })
    fresh()
    // 29 days of notice before the renewal start: not eligible (the database requires 30 to effect).
    const [early] = await transition(
      v2,
      new Date(end.getTime() - 29 * DAY),
      new Date(end.getTime() + DAY),
    )
    expect(
      (await billing.quote(testOwnerId, { planCode: 'essential', cycle: 'monthly' }))
        .planVersionNumber,
    ).toBe(1)
    await fixture.client`update subscription_scheduled_changes set status='cancelled' where id=${early!.id}`
    // Exactly 30 days of notice and effective at the renewal start: eligible.
    const [eligible] = await transition(v2, new Date(end.getTime() - 30 * DAY), end)
    const s = await subscriptions.summary(testOwnerId)
    expect(s.planVersionNumber).toBe(1)
    expect(s.scheduledVersionTransition).toEqual({
      targetVersionNumber: 2,
      effectiveAt: end.toISOString(),
      noticeSentAt: new Date(end.getTime() - 30 * DAY).toISOString(),
    })
    const quote = await billing.quote(testOwnerId, { planCode: 'essential', cycle: 'monthly' })
    expect(quote).toMatchObject({ kind: 'renewal', planVersionNumber: 2 })
    expect(quote.amount.amountHt).toBe(first.amount.amountHt + 700)
    const renewal = await pay('essential', 'second')
    expect(renewal.planVersionNumber).toBe(2)
    const [row] =
      await fixture.client`select status from subscription_scheduled_changes where id=${eligible!.id}`
    expect(row!.status).toBe('applied')
    // Already-paid coverage never changes: the running period keeps version 1 until it ends.
    expect(await periodPins()).toEqual([1, 2])
    expect((await subscriptions.summary(testOwnerId)).planVersionNumber).toBe(1)
    now = new Date(end.getTime() + 1)
    expect((await subscriptions.summary(testOwnerId)).planVersionNumber).toBe(2)
  })

  it('protects a prepaid future period from a later transition', async () => {
    await pay('essential', 'first')
    const prepaid = await pay('essential', 'prepaid')
    const v2 = await publishPlanVersion(fixture.client, 'essential')
    const start = new Date(prepaid.coverageStart!)
    await transition(v2, new Date(start.getTime() - 30 * DAY), start)
    await expect(
      billing.quote(testOwnerId, { planCode: 'essential', cycle: 'monthly' }),
    ).rejects.toMatchObject({ code: 'RENEWAL_EXISTS' })
    now = new Date(start.getTime() + DAY)
    expect((await subscriptions.summary(testOwnerId)).planVersionNumber).toBe(1)
    expect(await periodPins()).toEqual([1, 1])
  })

  it('pins administrator grants, plan changes and extensions explicitly', async () => {
    await pay('essential', 'first')
    await publishPlanVersion(fixture.client, 'business')
    const actor = { adminId: randomUUID(), email: 'ops@example.test', reason: 'support' }
    await fixture.client`insert into platform_admins(id,email,name,password_hash) values (${actor.adminId},'ops@example.test','Ops','x')`
    now = new Date(now.getTime() + DAY)
    await createBillingRepository(() => fixture.db).admin((tx) =>
      billing.administration.changePlan(testOwnerId, 'business', actor, tx),
    )
    await createBillingRepository(() => fixture.db).admin((tx) =>
      billing.administration.extend(testOwnerId, 5, actor, tx),
    )
    const rows =
      await fixture.client`select p.plan_code,v.version_number n from subscription_periods p join plan_versions v on v.id=p.plan_version_id where p.owner_id=${testOwnerId} and p.kind<>'trial' order by p.created_at, p.starts_at`
    // Plan change takes the selling version (2); the extension continues that period's pin.
    expect(rows.map((r) => [r.plan_code, r.n])).toEqual([
      ['essential', 1],
      ['business', 2],
      ['business', 2],
    ])
    await fixture.client`update plan_selling set plan_version_id=null,changed_by='test:operator' where plan_code='pro'`
    await expect(
      createBillingRepository(() => fixture.db).admin((tx) =>
        billing.administration.changePlan(testOwnerId, 'pro', actor, tx),
      ),
    ).rejects.toMatchObject({ code: 'PLAN_NOT_SELLABLE' })
  })

  it('fails closed on an unreadable pinned version for API, workers and summaries; payments stay readable', async () => {
    await pay('essential', 'first')
    const otherOwner = randomUUID(),
      otherOrganization = randomUUID()
    await fixture.client`insert into platform_users (id,email,password_hash) values (${otherOwner},'other@example.test','x')`
    await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${otherOrganization},${otherOwner},'Other','other',now())`
    // Corrupt the essential version behind every guard (simulated storage corruption).
    await fixture.client.begin(async (tx) => {
      await tx`set local session_replication_role = replica`
      await tx`delete from plan_entitlements where entitlement_key='storageBytes' and plan_version_id=(select id from plan_versions where plan_code='essential' and version_number=1)`
    })
    fresh()
    const scoped = tenantDatabase(fixture.db, testOrganizationId)
    await expect(subscriptions.summary(testOwnerId)).rejects.toMatchObject({
      code: 'SUBSCRIPTION_CATALOG_UNAVAILABLE',
      statusCode: 503,
    })
    await expect(scoped.transaction((tx) => subscriptions.assertAccess(tx))).rejects.toMatchObject({
      code: 'SUBSCRIPTION_CATALOG_UNAVAILABLE',
    })
    await expect(
      scoped.transaction((tx) => subscriptions.hasFeature(tx, 'custom_templates')),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_CATALOG_UNAVAILABLE' })
    expect((await billing.payments(testOwnerId)).data).toHaveLength(1)
    // Worker: the bad owner is a recorded failure, the other owner is still processed.
    const processed: string[] = []
    const run = createTenantWorkerRunner(
      () => fixture.db,
      (feature) =>
        tenantDatabase(fixture.db).transaction((tx) => subscriptions.workerEligible(tx, feature)),
    )
    const result = await run(async (id) => {
      processed.push(id)
    }).catch((error: AggregateError) => error)
    expect(result).toBeInstanceOf(AggregateError)
    expect((result as AggregateError).errors[0]).toMatchObject({
      code: 'SUBSCRIPTION_CATALOG_UNAVAILABLE',
    })
    expect(processed).toEqual([otherOrganization])
  })

  it('reports restrictions before plan values and keeps API and worker decisions identical', async () => {
    await pay('pro', 'pro')
    const scoped = tenantDatabase(fixture.db, testOrganizationId)
    const api = await scoped.transaction((tx) => subscriptions.assertAccess(tx))
    expect(api.entitlements.features).toContain('scheduled_reports')
    expect(
      await scoped.transaction((tx) => subscriptions.workerEligible(tx, 'scheduled_reports')),
    ).toBe(true)
    expect(api.accessValidUntil).not.toBeNull()
    expect(Date.parse(api.accessValidUntil!)).toBeGreaterThan(now.getTime())
    await fixture.client`update organizations set suspended_at=now() where id=${testOrganizationId}`
    await expect(scoped.transaction((tx) => subscriptions.assertAccess(tx))).rejects.toMatchObject({
      code: 'ORGANIZATION_SUSPENDED',
    })
    expect(
      await scoped.transaction((tx) => subscriptions.workerEligible(tx, 'scheduled_reports')),
    ).toBe(false)
    // Owner summary still carries the full typed values and their sources.
    const s = await subscriptions.summary(testOwnerId)
    expect(s.entitlements.features).toContain('scheduled_reports')
    expect(s.entitlementSources.every((x) => x.source === 'plan')).toBe(true)
  })
})
