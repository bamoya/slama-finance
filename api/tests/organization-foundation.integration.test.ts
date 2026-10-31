import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDatabase } from '../src/lib/db.js'
import { withOrganizationTransaction } from '../src/lib/organization-context.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const ownerId = '22222222-2222-4222-8222-222222222222'
const orgId = '33333333-3333-4333-8333-333333333333'

describe('SaaS organization foundation', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    await fixture.client`insert into platform_users (id,email,password_hash)
      values (${ownerId}, 'owner@example.test', 'independent-not-a-login-hash')`
    await fixture.client`insert into organizations (id,owner_id,name,slug)
      values (${orgId},${ownerId},'Slama','slama')`
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  it('preserves existing staff and company setup without creating owner staff accounts', async () => {
    const [staff] = await fixture.client`select id,email from users where id=${testUserId}`
    expect(staff?.email).toBe('operator@example.test')
    const [company] = await fixture.client`select count(*)::int as count from company_settings`
    expect(company?.count).toBe(2)
    const [duplicate] =
      await fixture.client`select count(*)::int as count from users where email='owner@example.test'`
    expect(duplicate?.count).toBe(0)
  })

  it('enforces ownership, language, slug and complete deletion windows', async () => {
    await expect(
      fixture.client`delete from platform_users where id=${ownerId}`,
    ).rejects.toMatchObject({ code: '23503' })
    await expect(
      fixture.client`update organizations set locale='ar' where id=${orgId}`,
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      fixture.client`update organizations set slug='Invalid_slug' where id=${orgId}`,
    ).rejects.toMatchObject({ code: '23514' })
    await expect(
      fixture.client`update organizations set deletion_due_at=now() where id=${orgId}`,
    ).rejects.toMatchObject({ code: '23514' })
    await fixture.client`update organizations set paused_at=now(),suspended_at=now() where id=${orgId}`
    await fixture.client`update organizations set paused_at=null where id=${orgId}`
    const [organization] =
      await fixture.client`select suspended_at from organizations where id=${orgId}`
    expect(organization?.suspended_at).not.toBeNull()
  })

  it('requires verified normalized domains and at most one active custom domain', async () => {
    await expect(fixture.client`insert into organization_domains (organization_id,hostname,activated_at)
      values (${orgId},'finance.example.com',now())`).rejects.toMatchObject({ code: '23514' })
    await expect(fixture.client`insert into organization_domains (organization_id,hostname)
      values (${orgId},'https://example.com/path')`).rejects.toMatchObject({ code: '23514' })
    await fixture.client`insert into organization_domains (organization_id,hostname,verified_at,activated_at)
      values (${orgId},'finance.example.com',now(),now())`
    await expect(fixture.client`insert into organization_domains (organization_id,hostname,verified_at,activated_at)
      values (${orgId},'other.example.com',now(),now())`).rejects.toMatchObject({ code: '23505' })
    await fixture.client.begin(async (tx) => {
      await tx`delete from role_permissions where organization_id=${orgId}`
      await tx`delete from roles where organization_id=${orgId}`
      await tx`delete from company_settings where organization_id=${orgId}`
      await tx`delete from notification_rules where organization_id=${orgId}`
      await tx`delete from organizations where id=${orgId}`
    })
    const [domains] = await fixture.client`select count(*)::int as count from organization_domains`
    expect(domains?.count).toBe(0)
  })

  it('clears transaction-local context after commit and rollback on the same connection', async () => {
    const context = { organizationId: orgId, actor: { type: 'owner' as const, id: ownerId } }
    const database = createDatabase(process.env.TEST_DATABASE_URL!, 1)
    const current = () =>
      database.db.execute(sql`select current_setting('app.organization_id', true) as organization`)
    try {
      await withOrganizationTransaction(database.db, context, async (tx) => {
        const rows =
          await tx.execute(sql`select current_setting('app.organization_id') as organization,
          current_setting('app.actor_type') as actor_type, current_setting('app.actor_id') as actor_id`)
        expect(rows[0]).toMatchObject({
          organization: orgId,
          actor_type: 'owner',
          actor_id: ownerId,
        })
      })
      expect((await current())[0]?.organization ?? '').toBe('')
      await expect(
        withOrganizationTransaction(database.db, context, async () => {
          throw new Error('rollback')
        }),
      ).rejects.toThrow('rollback')
      expect((await current())[0]?.organization ?? '').toBe('')
      const otherId = '44444444-4444-4444-8444-444444444444'
      await withOrganizationTransaction(
        database.db,
        { ...context, organizationId: otherId },
        async (tx) => {
          const rows = await tx.execute(
            sql`select current_setting('app.organization_id') as organization`,
          )
          expect(rows[0]?.organization).toBe(otherId)
        },
      )
      expect((await current())[0]?.organization ?? '').toBe('')
    } finally {
      await database.close()
    }
  })
})
