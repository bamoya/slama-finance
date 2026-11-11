import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as tables from '../db/schema/index.js'
// @ts-expect-error -- untyped JavaScript deployment initializer, exercised as shipped.
import { runtimeGrantStatements } from '../scripts/initialize-database.mjs'
import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import { createSubscriptionRepository } from '../src/modules/platform/subscriptions/repositories/subscription.repository.js'
import { createBillingService } from '../src/modules/platform/subscriptions/services/billing.service.js'
import { createSubscriptionService } from '../src/modules/platform/subscriptions/services/subscription.service.js'
import { isolatedDatabase, testOwnerId } from './helpers/postgres.js'

const DAY = 86_400_000
// Numbers and issue instants come from the database clock (not the injected test clock).
const year = Number(
  new Intl.DateTimeFormat('en', { timeZone: 'Africa/Casablanca', year: 'numeric' }).format(
    new Date(),
  ),
)

// S6: quotes, receipts, invoices, allocations and credit notes (#56–#63).
describe('Billing documents', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let now: Date
  let billing: ReturnType<typeof createBillingService>
  let subscriptions: ReturnType<typeof createSubscriptionService>

  beforeEach(async () => {
    fixture = await isolatedDatabase({ owner: 'trial' })
    now = new Date('2026-03-10T09:00:00Z')
    await fixture.client`update owner_subscriptions set plan_code='trial',paid_through_at=null,trial_started_at=${now.toISOString()}::timestamptz,trial_ends_at=${new Date(now.getTime() + 7 * DAY).toISOString()}::timestamptz where owner_id=${testOwnerId}`
    await fixture.client`update billing_settings set tax_rate_basis_points=2000`
    const subscriptionRepo = createSubscriptionRepository(() => fixture.db),
      billingRepo = createBillingRepository(() => fixture.db)
    billing = createBillingService(billingRepo, subscriptionRepo, () => now)
    subscriptions = createSubscriptionService(subscriptionRepo, billingRepo, () => now)
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  // business monthly: 29900 HT + 20 % = 35880 TTC
  const submit = (reference = 'owner-ref') =>
    billing.submit(testOwnerId, {
      planCode: 'business',
      cycle: 'monthly',
      method: 'bank_transfer',
      reference,
    })
  const count = async (table: string) =>
    Number((await fixture.client.unsafe(`select count(*)::int as n from ${table}`))[0]!.n)

  it('records an immutable quote at submission and issues one numbered invoice at receipt', async () => {
    const submitted = await submit()
    expect(submitted.quoteExpiresAt).toBe(new Date(now.getTime() + 15 * DAY).toISOString())
    expect(submitted).toMatchObject({ receivedTtc: 0, invoiceNumber: null })
    expect(await count('billing_invoices')).toBe(0)

    // Settings change after submission never touch the accepted snapshot.
    await fixture.client`update billing_settings set tax_rate_basis_points=1000`
    const confirmed = await billing.confirm(submitted.id, 'ops')
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      receivedTtc: 35880,
      invoiceNumber: `F-${year}-000001`,
    })
    const { items: data } = await billing.invoices(testOwnerId, 1)
    expect(data).toHaveLength(1)
    expect(data[0]).toMatchObject({
      kind: 'invoice',
      paymentId: submitted.id,
      totals: { amountHt: 29900, taxRateBasisPoints: 2000, taxAmount: 5980, amountTtc: 35880 },
      allocatedTtc: 35880,
      creditedTtc: 0,
      balanceTtc: 0,
      status: 'settled',
    })
    expect(data[0]!.lines).toEqual([
      expect.objectContaining({
        position: 1,
        planCode: 'business',
        planVersionNumber: 1,
        cycle: 'monthly',
        kind: 'activation',
      }),
    ])

    for (const table of [
      'billing_quotes',
      'billing_invoices',
      'billing_invoice_lines',
      'billing_receipts',
      'billing_allocations',
    ])
      await expect(
        fixture.client.unsafe(`update ${table} set amount_ttc=amount_ttc+1`),
      ).rejects.toMatchObject({ code: '42501' })
    await expect(fixture.client`delete from billing_invoices`).rejects.toMatchObject({
      code: '42501',
    })
  })

  it('rejects a submission whose snapshot differs from its quote', async () => {
    const submitted = await submit()
    const [quote] =
      await fixture.client`select quote_id from subscription_payments where id=${submitted.id}`
    await fixture.client`update subscription_payments set status='rejected',rejection_reason='x',decided_at=now() where id=${submitted.id}`
    await expect(
      fixture.client`insert into subscription_payments(owner_id,plan_code,plan_version_id,cycle,kind,method,reference,currency,amount_ht,tax_amount,amount_ttc,quote_id)
        select owner_id,plan_code,plan_version_id,cycle,kind,'cash','tampered',currency,amount_ht-1,tax_amount,amount_ttc-1,id from billing_quotes where id=${quote!.quote_id}`,
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('handles partial receipts idempotently and grants coverage once at full settlement', async () => {
    const submitted = await submit()
    const partial = await billing.confirm(submitted.id, 'ops', {
      reference: 'bank-1',
      amountTtc: 10000,
    })
    expect(partial).toMatchObject({ status: 'submitted', receivedTtc: 10000 })
    expect(partial.invoiceNumber).toBe(`F-${year}-000001`)
    expect((await subscriptions.summary(testOwnerId)).status).toBe('trial')

    // Same reference: no new receipt; same reference with another amount is refused.
    await billing.confirm(submitted.id, 'ops', { reference: 'bank-1', amountTtc: 10000 })
    await billing.confirm(submitted.id, 'ops', { reference: 'bank-1' })
    await expect(
      billing.confirm(submitted.id, 'ops', { reference: 'bank-1', amountTtc: 500 }),
    ).rejects.toMatchObject({ code: 'RECEIPT_REFERENCE_USED' })
    await expect(
      billing.confirm(submitted.id, 'ops', { reference: 'bank-2', amountTtc: 25881 }),
    ).rejects.toMatchObject({ code: 'AMOUNT_EXCEEDS_BALANCE' })
    expect(await count('billing_receipts')).toBe(1)

    // Two concurrent final receipts: one settles, the other finds the confirmed payment.
    const results = await Promise.all([
      billing.confirm(submitted.id, 'ops', { reference: 'bank-2' }),
      billing.confirm(submitted.id, 'ops', { reference: 'bank-3' }),
    ])
    expect(results.map((r) => r.status)).toEqual(['confirmed', 'confirmed'])
    expect(results[0]!.coverageStart).toBe(results[1]!.coverageStart)
    expect(await count('billing_receipts')).toBe(2)
    expect(await count('billing_invoices')).toBe(1)
    expect(await count(`subscription_periods where kind='paid'`)).toBe(1)
    const [sum] = await fixture.client`select sum(amount_ttc)::int as n from billing_allocations`
    expect(sum!.n).toBe(35880)
    expect((await subscriptions.summary(testOwnerId)).status).toBe('active')
  })

  it('honours a quote for funds received within its validity and refuses later funds', async () => {
    const submitted = await submit()
    const received = new Date(now.getTime() + 14 * DAY)
    now = new Date(now.getTime() + 20 * DAY)
    await expect(billing.confirm(submitted.id, 'ops')).rejects.toMatchObject({
      code: 'QUOTE_EXPIRED',
    })
    await expect(
      billing.confirm(submitted.id, 'ops', { receivedAt: new Date(now.getTime() + 1) }),
    ).rejects.toMatchObject({ code: 'RECEIVED_AT_INVALID' })
    expect(await count('billing_invoices')).toBe(0)

    const confirmed = await billing.confirm(submitted.id, 'ops', { receivedAt: received })
    expect(confirmed).toMatchObject({ status: 'confirmed', receivedTtc: 35880 })
    // Coverage starts at settlement, not at receipt or submission.
    expect(confirmed.coverageStart).toBe(now.toISOString())
    const [receipt] = await fixture.client`select received_at from billing_receipts`
    expect(new Date(receipt!.received_at).toISOString()).toBe(received.toISOString())
  })

  it('corrects only decided invoices with bounded, linked credit notes and keeps coverage', async () => {
    const submitted = await submit()
    await billing.confirm(submitted.id, 'ops', { reference: 'bank-1', amountTtc: 100 })
    const [invoice] = (await billing.invoices(testOwnerId, 1)).items
    await expect(
      billing.creditNote(invoice!.id, { amountHt: 1000, reason: 'Geste commercial' }, 'ops'),
    ).rejects.toMatchObject({ code: 'PAYMENT_PENDING' })
    await billing.confirm(submitted.id, 'ops', { reference: 'bank-2' })
    const before = await subscriptions.summary(testOwnerId)

    const note = await billing.creditNote(
      invoice!.id,
      { amountHt: 10000, reason: 'Geste commercial' },
      'ops',
    )
    expect(note).toMatchObject({
      kind: 'credit_note',
      number: `A-${year}-000001`,
      correctsNumber: invoice!.number,
      amountHt: 10000,
      taxAmount: 2000,
      amountTtc: 12000,
    })
    await expect(
      billing.creditNote(invoice!.id, { amountHt: 19901, reason: 'Trop' }, 'ops'),
    ).rejects.toMatchObject({ code: 'CREDIT_EXCEEDS_INVOICE' })
    await expect(
      billing.creditNote(note.id, { amountHt: 1, reason: 'Avoir sur avoir' }, 'ops'),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const invoices = (await billing.invoices(testOwnerId, 1)).items
    expect(invoices.find((i) => i.kind === 'invoice')).toMatchObject({
      creditedTtc: 12000,
      balanceTtc: -12000,
      status: 'refund_due',
    })
    expect(invoices.find((i) => i.kind === 'credit_note')).toMatchObject({
      correctsInvoiceNumber: invoice!.number,
      reason: 'Geste commercial',
      balanceTtc: 0,
    })
    const after = await subscriptions.summary(testOwnerId)
    expect(after.paidThroughAt).toBe(before.paidThroughAt)
  })

  it('numbers invoices gap-free per series and year', async () => {
    const first = await billing.confirm((await submit('a')).id, 'ops')
    now = new Date(first.coverageEnd!)
    const second = await billing.confirm((await submit('b')).id, 'ops')
    expect([first.invoiceNumber, second.invoiceNumber]).toEqual([
      `F-${year}-000001`,
      `F-${year}-000002`,
    ])
    const rejected = await submit('c')
    await billing.reject(rejected.id, 'ops', 'Not received')
    expect(await count('billing_invoices')).toBe(2)
  })

  it('lets an owner read only their own billing documents', async () => {
    await billing.confirm((await submit()).id, 'ops')
    const other = '20000000-0000-4000-8000-000000000009'
    await fixture.client`insert into platform_users (id,email,password_hash) values (${other},'other@example.test','x')`
    await fixture.client`grant select on billing_invoices, billing_invoice_lines, billing_allocations, billing_receipts, billing_quotes to ${fixture.client(fixture.role)}`
    const visible = (ownerId: string) =>
      fixture.client.begin(async (tx) => {
        await tx`select set_config('app.actor_type','owner',true), set_config('app.owner_id',${ownerId},true), set_config('app.organization_id','',true)`
        await tx.unsafe(`set local role "${fixture.role}"`)
        const [row] =
          await tx`select (select count(*)::int from billing_invoices) as invoices, (select count(*)::int from billing_invoice_lines) as lines, (select count(*)::int from billing_allocations) as allocations, (select count(*)::int from billing_receipts) as receipts, (select count(*)::int from billing_quotes) as quotes`
        return row
      })
    expect(await visible(testOwnerId)).toEqual({
      invoices: 1,
      lines: 1,
      allocations: 1,
      receipts: 1,
      quotes: 1,
    })
    expect(await visible(other)).toEqual({
      invoices: 0,
      lines: 0,
      allocations: 0,
      receipts: 0,
      quotes: 0,
    })
  })

  it('refuses a second instalment whose reference defaulted to an already recorded one', async () => {
    const submitted = await submit()
    await billing.confirm(submitted.id, 'ops', { amountTtc: 17940 })
    await expect(billing.confirm(submitted.id, 'ops', { amountTtc: 17940 })).rejects.toMatchObject({
      code: 'RECEIPT_REFERENCE_REQUIRED',
    })
    await expect(billing.confirm(submitted.id, 'ops')).rejects.toMatchObject({
      code: 'RECEIPT_REFERENCE_REQUIRED',
    })
    const settled = await billing.confirm(submitted.id, 'ops', { reference: 'bank-2' })
    expect(settled).toMatchObject({ status: 'confirmed', receivedTtc: 35880 })
  })

  it('stamps issue instants from the database clock after the number is taken', async () => {
    const before = new Date(
      (await fixture.client<{ t: Date }[]>`select clock_timestamp() as t`)[0]!.t,
    )
    const first = await billing.confirm((await submit('a')).id, 'ops')
    now = new Date(first.coverageEnd!)
    await billing.confirm((await submit('b')).id, 'ops')
    const rows = await fixture.client<
      { number: string; issued_at: Date }[]
    >`select number, issued_at from billing_invoices order by sequence`
    expect(rows.map((r) => r.number)).toEqual([`F-${year}-000001`, `F-${year}-000002`])
    expect(new Date(rows[0]!.issued_at).getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(new Date(rows[1]!.issued_at).getTime()).toBeGreaterThan(
      new Date(rows[0]!.issued_at).getTime(),
    )
  })

  it('checks upgrade preconditions before any receipt and receives upgrades in full', async () => {
    const first = await billing.confirm((await submit('base')).id, 'ops')
    now = new Date(new Date(first.coverageStart!).getTime() + 10 * DAY)
    const upgrade = await billing.submit(testOwnerId, {
      planCode: 'pro',
      cycle: 'monthly',
      method: 'cash',
      reference: 'up',
    })
    await expect(
      billing.confirm(upgrade.id, 'ops', { reference: 'up-1', amountTtc: 100 }),
    ).rejects.toMatchObject({ code: 'UPGRADE_REQUIRES_FULL_AMOUNT' })
    now = new Date(new Date(first.coverageEnd!).getTime() + DAY)
    await expect(billing.confirm(upgrade.id, 'ops')).rejects.toMatchObject({
      code: 'UPGRADE_STALE',
    })
    expect(await count(`billing_receipts where payment_id='${upgrade.id}'`)).toBe(0)
    expect(await count(`billing_invoices where payment_id='${upgrade.id}'`)).toBe(0)
  })

  it('completes an accepted quote after expiry with later instalments', async () => {
    const submitted = await submit()
    await billing.confirm(submitted.id, 'ops', { reference: 'bank-1', amountTtc: 10000 })
    now = new Date(now.getTime() + 30 * DAY)
    const done = await billing.confirm(submitted.id, 'ops', { reference: 'bank-2' })
    expect(done).toMatchObject({ status: 'confirmed', receivedTtc: 35880 })
  })

  it('rejects a partially paid payment by crediting its whole invoice, leaving a refund due', async () => {
    const submitted = await submit()
    await billing.confirm(submitted.id, 'ops', { reference: 'bank-1', amountTtc: 10000 })
    const before = await subscriptions.summary(testOwnerId)
    const rejected = await billing.reject(submitted.id, 'ops', 'Remainder never received')
    expect(rejected).toMatchObject({ status: 'rejected', receivedTtc: 10000 })
    const invoices = (await billing.invoices(testOwnerId, 1)).items
    expect(invoices.find((i) => i.kind === 'invoice')).toMatchObject({
      allocatedTtc: 10000,
      creditedTtc: 35880,
      balanceTtc: -10000,
      status: 'refund_due',
    })
    expect(invoices.find((i) => i.kind === 'credit_note')).toMatchObject({
      number: `A-${year}-000001`,
      reason: 'Remainder never received',
      totals: { amountHt: 29900, taxAmount: 5980, amountTtc: 35880 },
    })
    // Idempotent, coverage untouched, and the owner can submit again.
    await billing.reject(submitted.id, 'ops', 'Remainder never received')
    expect(await count(`billing_invoices where kind='credit_note'`)).toBe(1)
    expect((await subscriptions.summary(testOwnerId)).status).toBe(before.status)
    const again = await submit('new-ref')
    expect(again.status).toBe('submitted')
  })

  it('keeps credited HT and tax within the invoice split, the last note taking the remainder', async () => {
    const submitted = await submit()
    await billing.confirm(submitted.id, 'ops')
    const [invoice] = (await billing.invoices(testOwnerId, 1)).items
    // 3 HT at 20 % rounds tax up to 1 each time; the remainder note absorbs the drift.
    for (let i = 0; i < 3; i++)
      expect(
        await billing.creditNote(invoice!.id, { amountHt: 3, reason: 'Ajustement' }, 'ops'),
      ).toMatchObject({ amountHt: 3, taxAmount: 1 })
    await expect(
      billing.creditNote(invoice!.id, { amountHt: 29892, reason: 'Trop' }, 'ops'),
    ).rejects.toMatchObject({ code: 'CREDIT_EXCEEDS_INVOICE' })
    const last = await billing.creditNote(invoice!.id, { amountHt: 29891, reason: 'Solde' }, 'ops')
    expect(last).toMatchObject({ amountHt: 29891, taxAmount: 5977, amountTtc: 35868 })
    const [sums] =
      await fixture.client`select sum(amount_ht)::int as ht, sum(tax_amount)::int as tax from billing_invoices where kind='credit_note'`
    expect(sums).toEqual({ ht: 29900, tax: 5980 })
  })

  it('runs confirmation and credit notes under the restricted runtime role grants', async () => {
    const schema = (
      await fixture.client<{ schema: string }[]>`select current_schema() as schema`
    )[0]!.schema
    for (const statement of runtimeGrantStatements(`"${fixture.role}"`, `"${schema}"`))
      await fixture.client.unsafe(statement)
    // Same database, but every statement runs as the runtime role (no table ownership).
    const runtime = postgres(process.env.TEST_DATABASE_URL!, {
      max: 2,
      connection: { search_path: `${schema},pg_catalog`, role: fixture.role },
      onnotice: () => {},
    })
    try {
      const db = drizzle(runtime, { schema: tables })
      const subscriptionRepo = createSubscriptionRepository(() => db),
        billingRepo = createBillingRepository(() => db)
      const restricted = createBillingService(billingRepo, subscriptionRepo, () => now)
      const [current] = await runtime<{ role: string }[]>`select current_user as role`
      expect(current!.role).toBe(fixture.role)
      const submitted = await submit()
      await restricted.confirm(submitted.id, 'ops', { reference: 'bank-1', amountTtc: 10000 })
      const confirmed = await restricted.confirm(submitted.id, 'ops', { reference: 'bank-2' })
      expect(confirmed.status).toBe('confirmed')
      const [invoice] = (await billing.invoices(testOwnerId, 1)).items
      const note = await restricted.creditNote(
        invoice!.id,
        { amountHt: 100, reason: 'Remise' },
        'ops',
      )
      expect(note.kind).toBe('credit_note')
      // Rejection with held funds (credit note in the same transaction) under the same grants.
      const partial = await submit('second')
      await restricted.confirm(partial.id, 'ops', { reference: 'bank-3', amountTtc: 100 })
      await restricted.reject(partial.id, 'ops', 'Abandoned')
      expect(await count(`billing_invoices where kind='credit_note'`)).toBe(2)
    } finally {
      await runtime.end({ timeout: 2 })
    }
  })
})
