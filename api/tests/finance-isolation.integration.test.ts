import { randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { clients } from '../db/schema/clients.js'
import { backgroundJobs } from '../db/schema/jobs.js'
import { companySettings } from '../db/schema/settings.js'
import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { Database, Transaction } from '../src/lib/db.js'
import { currentOrganizationId, inTenantScope, tenantDatabase } from '../src/lib/tenant-database.js'
import { tenantObjectKey } from '../src/lib/tenant-storage.js'
import { createTenantWorkerRunner } from '../src/lib/tenant-workers.js'
import { createPasswordService } from '../src/modules/organization/identity/auth/services/password.service.js'
import { createOwnerOrganizationRepository } from '../src/modules/platform/organizations/repositories/owner-organization.repository.js'
import {
  fixtureSlugs,
  isolatedDatabase,
  routeToSites,
  testOrganizationId as orgA,
  testOwnerId,
  testUserId,
} from './helpers/postgres.js'

const orgB = '20000000-0000-4000-8000-000000000001'
const clientA = '30000000-0000-4000-8000-000000000001'
const clientB = '30000000-0000-4000-8000-000000000002'

describe('Finance tenant isolation under the non-bypass runtime role', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let runtime: Database
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${orgB},${testOwnerId},'Second','second',now())`
    await fixture.client`insert into clients(id,organization_id,type,legal_name) values (${clientA},${orgA},'company','Company A'),(${clientB},${orgB},'company','Company B')`
    const [schema] = await fixture.client`select current_schema() as name`
    await fixture.client.unsafe(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${schema!.name}" TO "${fixture.role}"`,
    )
    // Use actual PostgreSQL RLS, not the superuser fixture, for application/query assertions.
    runtime = new Proxy(fixture.db, {
      get(target, property) {
        if (property === 'transaction')
          return <T>(
            work: (tx: Transaction) => Promise<T>,
            options?: Parameters<Database['transaction']>[1],
          ) =>
            target.transaction(async (tx) => {
              await tx.execute(sql.raw(`SET LOCAL ROLE "${fixture.role}"`))
              await tx.execute(sql`select set_config('app.organization_id','',true)`)
              return work(tx)
            }, options)
        const value: unknown = Reflect.get(target, property)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  it('forces RLS and required organization scope across all 38 organization tables', async () => {
    const rows =
      await fixture.client`select c.relname,c.relrowsecurity,c.relforcerowsecurity,a.attnotnull
      from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attname='organization_id'
      join pg_policy p on p.polrelid=c.oid and p.polname='tenant_isolation'
      where c.relnamespace=(select oid from pg_namespace where nspname=current_schema())`
    expect(rows).toHaveLength(38)
    for (const row of rows) {
      expect(row.relrowsecurity, row.relname).toBe(true)
      expect(row.relforcerowsecurity, row.relname).toBe(true)
      expect(row.attnotnull, row.relname).toBe(true)
    }
    await runtime.transaction(async (tx) => {
      for (const row of rows) {
        const result = await tx.execute(sql.raw(`select count(*)::int n from "${row.relname}"`))
        expect(result[0]!.n, row.relname).toBe(0)
      }
    })
    await expect(
      runtime.transaction((tx) =>
        tx.insert(clients).values({ type: 'company', legalName: 'No scope' }),
      ),
    ).rejects.toThrow()
  })

  it('keeps concurrent queries, raw SQL, writes and nested transactions scoped and resets pooled context', async () => {
    const a = tenantDatabase(runtime, orgA),
      b = tenantDatabase(runtime, orgB)
    const results = await Promise.all(
      Array.from({ length: 12 }, (_, i) => (i % 2 ? a : b).select().from(clients)),
    )
    results.forEach((rows, i) =>
      expect(rows.map((row) => row.id)).toEqual([i % 2 ? clientA : clientB]),
    )
    expect((await a.execute(sql`select id from clients`)).map((row) => row.id)).toEqual([clientA])
    expect(
      await a
        .update(clients)
        .set({ legalName: 'Forbidden' })
        .where(sql`${clients.id}=${clientB}`)
        .returning(),
    ).toEqual([])
    await a.transaction(async (tx) => {
      await tx.transaction(async (nested) => {
        const rows = await nested.select().from(companySettings)
        expect(rows).toHaveLength(1)
        expect(rows[0]!.organizationId).toBe(orgA)
      })
    })
    await a.transaction(
      async (tx) => {
        expect(
          (await tx.execute(sql`show transaction isolation level`))[0]?.transaction_isolation,
        ).toBe('repeatable read')
      },
      { isolationLevel: 'repeatable read' },
    )
    expect(await a.select().from(companySettings)).toHaveLength(1)
    expect(await b.select().from(companySettings)).toHaveLength(1)
    await runtime.transaction(async (tx) => expect(await tx.select().from(clients)).toEqual([]))
    expect(currentOrganizationId()).toBeUndefined()
    const portfolio = await createOwnerOrganizationRepository(() => runtime).list(testOwnerId, {
      page: 1,
      pageSize: 20,
    })
    expect(portfolio.items.find((row) => row.organization.id === orgA)?.staffCount).toBe(1)
    expect(portfolio.items.find((row) => row.organization.id === orgB)?.staffCount).toBe(0)
  })

  it('rejects cross-tenant relationships even for a privileged writer and accepts tenant-local uniqueness', async () => {
    await expect(
      fixture.client`insert into invoices(organization_id,client_id,issue_date,issuer_snapshot,client_snapshot,appearance_snapshot) values (${orgA},${clientB},current_date,'{}','{}','{}')`,
    ).rejects.toMatchObject({ code: '23503' })
    await fixture.client`insert into product_categories(organization_id,name) values (${orgA},'Same category'),(${orgB},'Same category')`
    await expect(
      tenantDatabase(runtime, orgA)
        .insert(clients)
        .values({ organizationId: orgB, type: 'company', legalName: 'Other tenant' }),
    ).rejects.toMatchObject({ code: '42501' })
    const aForeignStorage = () =>
      tenantDatabase(runtime, orgA).execute(
        sql`insert into media_assets(object_key,original_filename,content_type,byte_size,sha256,purpose,status) values (${`organizations/${orgB}/media/${randomUUID()}.png`},'image.png','image/png',1,${'a'.repeat(64)},'company_logo','ready')`,
      )
    await expect(aForeignStorage()).rejects.toMatchObject({ code: '23514' })
    const guards =
      await fixture.client`select count(*)::int n from pg_constraint where conname like 'tenant_fk_%' and connamespace=(select oid from pg_namespace where nspname=current_schema())`
    expect(guards[0]!.n).toBe(50)
  })

  it('checks credentials and permissions against the selected organization for every HTTP request', async () => {
    const password = 'tenant-test-password-2026'
    await fixture.client`update users set password_hash=${await createPasswordService().hash(password)} where id=${testUserId}`
    await fixture.client`insert into user_roles(user_id,role_id) select ${testUserId},id from roles where organization_id=${orgA} and key='admin'`
    const app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
    })
    app.database = () => runtime
    routeToSites(app, fixtureSlugs(fixture))
    try {
      const login = await app.inject({
        method: 'POST',
        url: '/api/v1/organization-auth/login',
        headers: { origin: 'http://localhost:5173', 'x-organization-id': orgA },
        payload: { email: 'operator@example.test', password },
      })
      expect(login.statusCode, login.body).toBe(200)
      const cookies = { slama_staff_session: login.cookies[0]!.value }
      const get = (organizationId?: string) =>
        app.inject({
          url: '/api/v1/clients',
          cookies,
          headers: organizationId ? { 'x-organization-id': organizationId } : {},
        })
      const own = await get(orgA)
      expect(own.statusCode, own.body).toBe(200)
      expect(own.json().items.map((row: { id: string }) => row.id)).toEqual([clientA])
      expect((await get(orgB)).statusCode).toBe(403)
      // A host without a known organization never reaches tenant data.
      const unknownHost = await app.inject({
        url: '/api/v1/clients',
        cookies,
        headers: { host: 'missing-organization.localhost:5173' },
      })
      expect(unknownHost.statusCode).toBe(404)
      const foreign = await app.inject({
        url: `/api/v1/clients/${clientB}`,
        cookies,
        headers: { 'x-organization-id': orgA },
      })
      expect(foreign.statusCode).toBe(404)
      await fixture.client`update company_settings set legal_name='Company A',address_line1='Rue Atlas',city='Rabat' where organization_id=${orgA}`
      const invoiceA = randomUUID(),
        invoiceB = randomUUID(),
        artifactB = randomUUID()
      await fixture.client`insert into invoices(id,organization_id,client_id,issue_date,issuer_snapshot,client_snapshot,appearance_snapshot)
        values (${invoiceA},${orgA},${clientA},current_date,'{}','{}','{}'),(${invoiceB},${orgB},${clientB},current_date,'{}','{}','{}')`
      await fixture.client`insert into document_artifacts(id,organization_id,document_type,document_id,source_version,format,object_key,mime_type,byte_size,sha256)
        values (${artifactB},${orgB},'invoice',${invoiceB},1,'pdf',${`organizations/${orgB}/artifacts/invoice/${randomUUID()}.pdf`},'application/pdf',1,${'a'.repeat(64)})`
      const headers = { 'x-organization-id': orgA, origin: 'http://localhost:5173' }
      const invoices = await app.inject({ url: '/api/v1/invoices', headers, cookies })
      expect(invoices.statusCode, invoices.body).toBe(200)
      expect(invoices.json().items.map((row: { id: string }) => row.id)).toEqual([invoiceA])
      expect(
        (await app.inject({ url: `/api/v1/invoices/${invoiceB}`, headers, cookies })).statusCode,
      ).toBe(404)
      expect(
        (await app.inject({ url: `/api/v1/artifacts/${artifactB}/download`, headers, cookies }))
          .statusCode,
      ).toBe(404)
      const mixed = await app.inject({
        method: 'POST',
        url: '/api/v1/sales/deletion/preview',
        headers,
        cookies,
        payload: {
          resource: 'invoices',
          records: [
            { id: invoiceA, expectedVersion: 1 },
            { id: invoiceB, expectedVersion: 1 },
          ],
        },
      })
      expect(mixed.statusCode, mixed.body).toBe(404)
      expect(await fixture.client`select id from invoices`).toHaveLength(2)
      await fixture.client`update organizations set paused_at=now() where id=${orgA}`
      expect((await get(orgA)).statusCode).toBe(403)
    } finally {
      await app.close()
    }
  })

  it('scopes workers, idempotency keys and object paths separately and skips paused organizations', async () => {
    for (const id of [orgA, orgB])
      await tenantDatabase(runtime, id)
        .insert(backgroundJobs)
        .values({ jobType: 'prepare_pdf', payload: {}, idempotencyKey: 'same:key' })
    await fixture.client`update organizations set paused_at=now() where id=${orgB}`
    const runner = createTenantWorkerRunner(
      () => runtime,
      async () => true,
    )
    const seen: string[] = []
    await runner(async (id) => {
      seen.push(id)
      expect(currentOrganizationId()).toBe(id)
      const db = tenantDatabase(runtime)
      expect(
        (await db.select().from(backgroundJobs)).every((row) => row.organizationId === id),
      ).toBe(true)
      expect(await tenantObjectKey(db, 'artifacts/invoice/file.pdf')).toBe(
        `organizations/${id}/artifacts/invoice/file.pdf`,
      )
    })
    expect(seen).toEqual([orgA])
    await fixture.client`update organizations set paused_at=null where id=${orgB}`
    const processed: string[] = []
    await expect(
      runner(async (id) => {
        processed.push(id)
        if (id === orgA) throw Error('One tenant failed')
      }),
    ).rejects.toBeInstanceOf(AggregateError)
    expect(processed).toEqual([orgA, orgB])

    expect(currentOrganizationId()).toBeUndefined()
    expect(
      await inTenantScope(orgB, () => tenantObjectKey(tenantDatabase(runtime), 'media/image.png')),
    ).toBe(`organizations/${orgB}/media/image.png`)
    await expect(
      inTenantScope(orgA, async () => {
        throw Error('scope rollback')
      }),
    ).rejects.toThrow('scope rollback')
    expect(currentOrganizationId()).toBeUndefined()
    const a = tenantDatabase(runtime, orgA)
    await expect(
      a.transaction(async (tx) => {
        await tx.insert(clients).values({ type: 'company', legalName: randomUUID() })
        throw Error('rollback')
      }),
    ).rejects.toThrow('rollback')
    expect(await a.select().from(clients)).toHaveLength(1)
  })
})
