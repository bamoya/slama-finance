import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { withOrganizationTransaction } from '../src/lib/organization-context.js'
import { isolatedDatabase } from './helpers/postgres.js'

const ownerId = '22222222-2222-4222-8222-222222222222'
const orgA = '33333333-3333-4333-8333-333333333333'
const orgB = '44444444-4444-4444-8444-444444444444'

describe('Organization RLS boundary under a non-bypass database role', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    await fixture.client`insert into platform_users (id,email,password_hash)
      values (${ownerId},'owner@example.test','test-only-not-a-password')`
    await fixture.client`insert into organizations (id,owner_id,name,slug)
      values (${orgA},${ownerId},'A','org-a'),(${orgB},${ownerId},'B','org-b')`
    await fixture.client`insert into organization_domains (organization_id,hostname)
      values (${orgA},'a.example.com'),(${orgB},'b.example.com')`
    // This grant applies only to the fixture-generated, validated NOLOGIN test role.
    await fixture.client.unsafe(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON organizations,organization_domains TO "${fixture.role}"`,
    )
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })
  const asRole = (role: string) => sql.raw(`set local role "${role}"`)

  it('fails closed without a tenant context and cannot read owner credentials', async () => {
    await fixture.db.transaction(async (tx) => {
      await tx.execute(asRole(fixture.role))
      await tx.execute(sql`select set_config('app.organization_id','',true)`)
      expect(await tx.execute(sql`select * from organizations`)).toHaveLength(0)
      expect(await tx.execute(sql`select * from organization_domains`)).toHaveLength(0)
      expect(
        await tx.execute(sql`update organizations set name='changed' returning id`),
      ).toHaveLength(0)
    })
    await expect(
      fixture.db.transaction(async (tx) => {
        await tx.execute(asRole(fixture.role))
        await tx.execute(sql`select password_hash from platform_users`)
      }),
    ).rejects.toMatchObject({ code: '42501' })
  })

  it('scopes unfiltered reads, updates and deletes and rejects cross-tenant writes', async () => {
    const context = { organizationId: orgA, actor: { type: 'owner' as const, id: ownerId } }
    await withOrganizationTransaction(fixture.db, context, async (tx) => {
      await tx.execute(asRole(fixture.role))
      expect(await tx.execute(sql`select id from organizations`)).toMatchObject([{ id: orgA }])
      expect(await tx.execute(sql`select hostname from organization_domains`)).toMatchObject([
        { hostname: 'a.example.com' },
      ])
      expect(
        await tx.execute(
          sql`update organizations set name='intrusion' where id=${orgB} returning id`,
        ),
      ).toHaveLength(0)
      expect(
        await tx.execute(
          sql`delete from organization_domains where organization_id=${orgB} returning id`,
        ),
      ).toHaveLength(0)
    })
    await expect(
      withOrganizationTransaction(fixture.db, context, async (tx) => {
        await tx.execute(asRole(fixture.role))
        await tx.execute(
          sql`insert into organization_domains (organization_id,hostname) values (${orgB},'intrusion.example.com')`,
        )
      }),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      withOrganizationTransaction(fixture.db, context, async (tx) => {
        await tx.execute(asRole(fixture.role))
        await tx.execute(
          sql`update organization_domains set organization_id=${orgB} where organization_id=${orgA}`,
        )
      }),
    ).rejects.toMatchObject({ code: '42501' })
    const [other] = await fixture.client`select name from organizations where id=${orgB}`
    expect(other?.name).toBe('B')
  })

  it('forces RLS even for a non-bypass table owner and retains tenant isolation between requests', async () => {
    await fixture.client.unsafe(`ALTER TABLE organization_domains OWNER TO "${fixture.role}"`)
    await fixture.db.transaction(async (tx) => {
      await tx.execute(asRole(fixture.role))
      expect(await tx.execute(sql`select * from organization_domains`)).toHaveLength(0)
    })
    for (const [organizationId, hostname] of [
      [orgA, 'a.example.com'],
      [orgB, 'b.example.com'],
    ] as const) {
      await withOrganizationTransaction(
        fixture.db,
        { organizationId, actor: { type: 'owner', id: ownerId } },
        async (tx) => {
          await tx.execute(asRole(fixture.role))
          expect(await tx.execute(sql`select hostname from organization_domains`)).toMatchObject([
            { hostname },
          ])
        },
      )
    }
  })
})
