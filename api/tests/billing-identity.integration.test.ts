import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import * as tables from '../db/schema/index.js'
// @ts-expect-error -- untyped JavaScript deployment initializer, exercised as shipped.
import { runtimeGrantStatements } from '../scripts/initialize-database.mjs'
import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import { createSubscriptionRepository } from '../src/modules/platform/subscriptions/repositories/subscription.repository.js'
import { createBillingService } from '../src/modules/platform/subscriptions/services/billing.service.js'
import { isolatedDatabase, testOwnerId } from './helpers/postgres.js'

const DAY = 86_400_000
const company = {
  type: 'company' as const,
  legalName: 'Atlas Distribution SARL',
  ice: '001122334455667',
  address: '25 Rue des Oliviers, Rabat',
  registrationNumber: 'RC 4455',
  taxIdentifier: null,
}

// Billing identity (billing-identity.md): customer snapshot at quote, issuer snapshot at issue.
describe('Billing identity', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let billing: ReturnType<typeof createBillingService>
  const now = new Date('2026-03-10T09:00:00Z')

  beforeEach(async () => {
    fixture = await isolatedDatabase({ owner: 'trial' })
    await fixture.client`update owner_subscriptions set plan_code='trial',paid_through_at=null,trial_started_at=${now.toISOString()}::timestamptz,trial_ends_at=${new Date(now.getTime() + 7 * DAY).toISOString()}::timestamptz where owner_id=${testOwnerId}`
    billing = createBillingService(
      createBillingRepository(() => fixture.db),
      createSubscriptionRepository(() => fixture.db),
      () => now,
    )
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })
  const submit = (reference: string, customer?: typeof company | { type: 'individual' }) =>
    billing.submit(testOwnerId, {
      planCode: 'business',
      cycle: 'monthly',
      method: 'bank_transfer',
      reference,
      ...(customer
        ? {
            customer: {
              legalName: null,
              ice: null,
              address: null,
              registrationNumber: null,
              taxIdentifier: null,
              ...customer,
            },
          }
        : {}),
    })

  it('defaults to an individual who gives nothing, on the quote, payment and invoice', async () => {
    expect((await billing.catalog(testOwnerId)).customer).toMatchObject({
      type: 'individual',
      legalName: null,
    })
    const submitted = await submit('ind')
    expect(submitted.customer).toEqual({
      type: 'individual',
      legalName: null,
      ice: null,
      address: null,
      registrationNumber: null,
      taxIdentifier: null,
    })
    await billing.confirm(submitted.id, 'ops')
    const [invoice] = (await billing.invoices(testOwnerId, 1)).items
    expect(invoice!.customer.type).toBe('individual')
    // The owner e-mail is snapshotted for printing (quote and invoice) but not exposed by the API.
    expect(invoice!.customer).not.toHaveProperty('email')
    const [stored] =
      await fixture.client`select q.customer->>'email' as quote, i.customer->>'email' as invoice from billing_quotes q join billing_invoices i on i.payment_id=(select id from subscription_payments where quote_id=q.id)`
    expect(stored).toEqual({
      quote: 'fixture-owner@example.test',
      invoice: 'fixture-owner@example.test',
    })
    await expect(
      fixture.client`insert into billing_customer_profiles(owner_id,type) values (${testOwnerId},'individual')`.then(
        () =>
          fixture.client`insert into billing_quotes(owner_id,plan_code,plan_version_id,cycle,kind,currency,amount_ht,tax_amount,amount_ttc,issued_at,expires_at,customer)
            select owner_id,plan_code,plan_version_id,cycle,kind,currency,amount_ht,tax_amount,amount_ttc,issued_at,expires_at,customer||'{"email":" "}' from billing_quotes limit 1`,
      ),
    ).rejects.toThrow(/billing_quote_customer/)
    expect(invoice!.issuer.legalName).toBe('Fixture Platform SARL')
    // An individual choice drops any company details sent along.
    const cleaned = await billing.saveCustomer(testOwnerId, { ...company, type: 'individual' })
    expect(cleaned.customer).toMatchObject({ type: 'individual', legalName: null, ice: null })
  })

  it('validates company details, saves them as the profile and snapshots them', async () => {
    await expect(submit('bad', { ...company, ice: '1234' })).rejects.toMatchObject({
      statusCode: 400,
      fieldErrors: { ice: expect.any(Array) },
    })
    await expect(
      billing.saveCustomer(testOwnerId, { ...company, legalName: '  ', address: null }),
    ).rejects.toMatchObject({
      fieldErrors: { legalName: expect.any(Array), address: expect.any(Array) },
    })
    expect(await fixture.client`select 1 from billing_quotes`).toHaveLength(0)
    const submitted = await submit('co', { ...company, ice: '001 122 334 455 667' })
    expect(submitted.customer).toEqual(company)
    expect((await billing.catalog(testOwnerId)).customer).toEqual(company)
    await billing.confirm(submitted.id, 'ops')

    // Later profile and issuer edits never change the quote or the issued invoice.
    await billing.saveCustomer(testOwnerId, { ...company, legalName: 'Renamed SARL' })
    await fixture.client`update billing_settings set issuer_legal_name='New Issuer SA'`
    const [invoice] = (await billing.invoices(testOwnerId, 1)).items
    expect(invoice!.customer).toEqual(company)
    expect(invoice!.issuer.legalName).toBe('Fixture Platform SARL')
    expect((await billing.payments(testOwnerId)).data[0]!.customer).toEqual(company)
    await expect(
      fixture.client`update billing_invoices set customer=customer||'{"legalName":"x"}'`,
    ).rejects.toThrow(/immutable/)
    await expect(
      fixture.client`update billing_quotes set customer=customer||'{"legalName":"x"}'`,
    ).rejects.toThrow(/immutable/)

    // A credit note repeats the invoice customer and snapshots the issuer at its own issue.
    const note = await billing.creditNote(invoice!.id, { amountHt: 100, reason: 'Remise' }, 'ops')
    expect(note.customer).toEqual({ ...company, email: 'fixture-owner@example.test' })
    expect(note.issuer.legalName).toBe('New Issuer SA')
  })

  it('refuses invalid identities and mismatched snapshots in the database', async () => {
    await expect(
      fixture.client`insert into billing_customer_profiles(owner_id,type,legal_name,ice,address) values (${testOwnerId},'company','X','123','Rue')`,
    ).rejects.toThrow(/billing_customer_profile_identity/)
    await expect(
      fixture.client`insert into billing_customer_profiles(owner_id,type,legal_name) values (${testOwnerId},'individual','X')`,
    ).rejects.toThrow(/billing_customer_profile_identity/)
    await expect(fixture.client`update billing_settings set issuer_ice='12'`).rejects.toThrow(
      /billing_settings_issuer_ice/,
    )
    const submitted = await submit('db', company)
    await billing.confirm(submitted.id, 'ops')
    const [invoice] = await fixture.client`select * from billing_invoices`
    // A credit note must repeat the customer of the invoice it corrects (checked at commit).
    await expect(
      fixture.client.begin(async (tx) => {
        await tx`insert into billing_invoices(owner_id,kind,series,year,sequence,number,corrects_invoice_id,reason,currency,amount_ht,tax_rate_basis_points,tax_amount,amount_ttc,issued_at,issued_by,customer,issuer)
          values (${invoice!.owner_id},'credit_note','A',2026,99,'A-2026-000099',${invoice!.id},'x','MAD',1,null,0,1,now(),'ops','{"type":"individual"}',(select issuer from billing_invoices where id=${invoice!.id}))`
        await tx`insert into billing_invoice_lines(invoice_id,position,plan_code,plan_version_id,cycle,kind,currency,amount_ht,tax_amount,amount_ttc)
          select id,1,'business',(select plan_version_id from billing_invoice_lines limit 1),'monthly','activation','MAD',1,0,1 from billing_invoices where number='A-2026-000099'`
      }),
    ).rejects.toThrow(/customer/)
  })

  it('saves the profile and issues snapshots under the restricted runtime role grants', async () => {
    const schema = (
      await fixture.client<{ schema: string }[]>`select current_schema() as schema`
    )[0]!.schema
    for (const statement of runtimeGrantStatements(`"${fixture.role}"`, `"${schema}"`))
      await fixture.client.unsafe(statement)
    const runtime = postgres(process.env.TEST_DATABASE_URL!, {
      max: 2,
      connection: { search_path: `${schema},pg_catalog`, role: fixture.role },
      onnotice: () => {},
    })
    try {
      const db = drizzle(runtime, { schema: tables })
      const restricted = createBillingService(
        createBillingRepository(() => db),
        createSubscriptionRepository(() => db),
        () => now,
      )
      await restricted.saveCustomer(testOwnerId, company)
      await restricted.saveCustomer(testOwnerId, { ...company, registrationNumber: null })
      const submitted = await restricted.submit(testOwnerId, {
        planCode: 'business',
        cycle: 'monthly',
        method: 'bank_transfer',
        reference: 'rt',
      })
      expect(submitted.customer).toMatchObject({ type: 'company', registrationNumber: null })
      await restricted.confirm(submitted.id, 'ops')
      const [invoice] = (await restricted.invoices(testOwnerId, 1)).items
      expect(invoice!.customer.legalName).toBe(company.legalName)
      // Owners see only their own profile.
      const other = '20000000-0000-4000-8000-000000000009'
      const rows = await runtime.begin(async (tx) => {
        await tx`select set_config('app.actor_type','owner',true), set_config('app.owner_id',${other},true)`
        return tx`select * from billing_customer_profiles`
      })
      expect(rows).toHaveLength(0)
    } finally {
      await runtime.end({ timeout: 2 })
    }
  })
})
