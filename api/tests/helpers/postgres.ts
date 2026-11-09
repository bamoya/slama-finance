import { randomUUID } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'

import { drizzle } from 'drizzle-orm/postgres-js'
import type { FastifyInstance } from 'fastify'
import postgres from 'postgres'

import * as tables from '../../db/schema/index.js'
import { createBillingRepository } from '../../src/modules/platform/subscriptions/repositories/billing.repository.js'

export const testOrganizationId = '10000000-0000-4000-8000-000000000001'
export const testOwnerId = '10000000-0000-4000-8000-000000000002'

export const testUserId = '11111111-1111-4111-8111-111111111111'
/**
 * Fixture owner subscription: `legacy` is the legacy-only `pro` paid-through marker (no period, so
 * periods reads see the trial); `paid` is confirmed `pro` coverage written like a confirmation;
 * `trial` leaves the trial only.
 */
export async function isolatedDatabase({
  owner = 'legacy',
}: { owner?: 'legacy' | 'paid' | 'trial' } = {}) {
  const value = process.env.TEST_DATABASE_URL
  if (!value)
    throw new Error(
      'TEST_DATABASE_URL is required for integration tests (use the dedicated test container).',
    )
  const url = new URL(value)
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !/^\/\w+_test$/.test(url.pathname)
  )
    throw new Error('Integration tests require a localhost database with a name ending in _test.')
  const suffix = randomUUID().replaceAll('-', '')
  const schema = `foundation_test_${suffix}`
  const role = `foundation_app_${suffix}`
  const admin = postgres(value, { max: 1, onnotice: () => {} })
  const client = postgres(value, {
    max: 4,
    connection: { search_path: `${schema},pg_catalog`, 'app.organization_id': testOrganizationId },
    onnotice: () => {},
  })
  const cleanup = async () => {
    // Only identifiers created by this fixture may be targeted by cascading cleanup.
    if (
      !/^foundation_test_[a-f0-9]{32}$/.test(schema) ||
      !/^foundation_app_[a-f0-9]{32}$/.test(role)
    )
      throw new Error('Unsafe fixture cleanup')
    await client.end({ timeout: 2 })
    try {
      await admin.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await admin.unsafe(`DROP ROLE IF EXISTS "${role}"`)
    } finally {
      await admin.end({ timeout: 2 })
    }
  }
  try {
    await admin.unsafe(`CREATE SCHEMA "${schema}"`)
    await admin.unsafe(`CREATE ROLE "${role}" NOLOGIN`)
    const migrationDir = new URL('../../db/migrations/', import.meta.url)
    for (const name of (await readdir(migrationDir))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      const baseline = await readFile(new URL(name, migrationDir), 'utf8')
      // gen_random_uuid is native in supported PostgreSQL; do not mutate cluster extensions.
      await client.unsafe(
        baseline
          .replace('CREATE EXTENSION IF NOT EXISTS pgcrypto;', '')
          .replaceAll('"public".', `"${schema}".`),
      )
    }
    await client`insert into platform_users (id,email,password_hash) values (${testOwnerId},'fixture-owner@example.test','not-a-login-hash')`
    await client`insert into organizations(id,owner_id,name,slug,activated_at) values (${testOrganizationId},${testOwnerId},'Fixture','fixture',now())`
    const db = drizzle(client, { schema: tables })
    if (owner === 'legacy')
      await client`update owner_subscriptions set plan_code='pro',paid_through_at=now()+interval '30 days' where owner_id=${testOwnerId}`
    if (owner === 'paid')
      await seedPaidCoverage(db, {
        ownerId: testOwnerId,
        planCode: 'pro',
        start: new Date(Date.now() - 30 * DAY),
        end: new Date(Date.now() + 30 * DAY),
        reference: 'fixture-coverage',
      })
    await client`INSERT INTO users (id, email, password_hash, first_name, last_name, must_change_password) VALUES (${testUserId}, 'operator@example.test', 'fixture-not-a-login-hash', 'Test', 'Operator', false)`
    await admin.unsafe(`GRANT USAGE ON SCHEMA "${schema}" TO "${role}"`)
    await admin.unsafe(`GRANT SELECT, INSERT ON "${schema}".actors TO "${role}"`)
    await admin.unsafe(`GRANT SELECT ON "${schema}".organizations TO "${role}"`)
    await admin.unsafe(`GRANT SELECT ON "${schema}".organization_slug_history TO "${role}"`)
    await admin.unsafe(`GRANT SELECT, INSERT, UPDATE ON "${schema}".users TO "${role}"`)
    await admin.unsafe(`GRANT SELECT, INSERT ON "${schema}".audit_events TO "${role}"`)
    return { db, client, role, cleanup }
  } catch (error) {
    await cleanup()
    throw error
  }
}

/**
 * Routes every injected request to its platform site by setting the Host header: owner and admin
 * routes go to app./admin., public routes to the apex and organization routes to <slug>. of the
 * organization named by the test-only `x-organization-id` header (default: the fixture). The
 * legacy test origin is rewritten to the request's own site origin; explicit hosts are kept.
 */
const DAY = 86_400_000

/**
 * Confirmed paid coverage written like a payment confirmation (S5b dual write): the confirmed payment,
 * its paid period superseding the rest of the running coverage (later start wins) and the legacy
 * paid-through/plan.
 */
export async function seedPaidCoverage(
  db: ReturnType<typeof drizzle<typeof tables>>,
  values: {
    ownerId: string
    planCode: string
    start: Date
    end: Date
    reference: string
    kind?: 'activation' | 'renewal' | 'upgrade'
  },
) {
  const billing = createBillingRepository(() => db)
  return billing.admin(async (tx) => {
    const [payment] = await tx
      .insert(tables.subscriptionPayments)
      .values({
        ownerId: values.ownerId,
        planCode: values.planCode,
        cycle: 'monthly',
        kind: values.kind ?? 'activation',
        method: 'cash',
        reference: values.reference,
        currency: 'MAD',
        amountHt: 100,
        taxAmount: 0,
        amountTtc: 100,
        status: 'confirmed',
        coverageStart: values.start,
        coverageEnd: values.end,
        decidedAt: new Date(),
      })
      .returning()
    const period = await billing.insertPeriod(
      {
        ownerId: values.ownerId,
        kind: 'paid',
        planCode: values.planCode,
        cycle: 'monthly',
        start: values.start,
        end: values.end,
        paymentId: payment!.id,
      },
      tx,
    )
    await billing.supersedeAt(values.ownerId, values.start, period!, tx)
    await billing.applyCoverage(
      values.ownerId,
      { paidThroughAt: values.end, planCode: values.planCode },
      tx,
    )
    return payment!
  })
}

export function routeToSites(
  app: FastifyInstance,
  slugOf: (organizationId: string) => Promise<string | undefined>,
) {
  const inject = app.inject.bind(app)
  const domain = app.sites.domain
  app.inject = (async (options: string | { url?: string; headers?: Record<string, unknown> }) => {
    const input = typeof options === 'string' ? { url: options } : options
    const headers: Record<string, unknown> = { ...input.headers }
    const url = input.url ?? ''
    const organizationId =
      (headers['x-organization-id'] as string | undefined) ?? testOrganizationId
    delete headers['x-organization-id']
    let host = headers.host as string | undefined
    if (!host) {
      if (url.startsWith('/api/v1/owner')) host = `app.${domain}`
      else if (url.startsWith('/api/v1/admin/')) host = `admin.${domain}`
      else if (url.startsWith('/api/v1/public/')) host = domain
      else host = `${(await slugOf(organizationId)) ?? 'missing-organization'}.${domain}`
    }
    if (headers.origin === 'http://localhost:5173') headers.origin = app.sites.originOf(host)
    return inject({ ...input, headers: { ...headers, host } } as never)
  }) as typeof app.inject
}

export function attachTestDatabase(
  app: FastifyInstance,
  fixture: Awaited<ReturnType<typeof isolatedDatabase>>,
) {
  app.database = () => fixture.db
  routeToSites(app, fixtureSlugs(fixture))
}

export function fixtureSlugs(fixture: Awaited<ReturnType<typeof isolatedDatabase>>) {
  return async (id: string) => {
    const [row] = await fixture.client<
      { slug: string }[]
    >`select slug from organizations where id=${id}`
    return row?.slug
  }
}
