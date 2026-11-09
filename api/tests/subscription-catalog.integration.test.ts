import { readFile } from 'node:fs/promises'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createCatalogRepository } from '../src/modules/platform/subscriptions/repositories/catalog.repository.js'
import { compareCatalogVersion } from '../src/modules/platform/subscriptions/services/catalog-comparison.service.js'
import { isolatedDatabase } from './helpers/postgres.js'

const reference = () =>
  readFile(new URL('../db/reference/subscription-catalog.sql', import.meta.url), 'utf8')

describe('Inactive normalized subscription catalog', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  async function draft(number = 2) {
    const [v] =
      await fixture.client`insert into plan_versions(plan_code,version_number,display_name,rank) values ('business',${number},'Draft',2) returning id`
    const id = String(v!.id)
    await fixture.client`insert into plan_entitlements select ${id}::uuid,entitlement_key,value_type,boolean_value,integer_value,is_unlimited from plan_entitlements where plan_version_id=(select id from plan_versions where plan_code='business' and version_number=1)`
    await fixture.client`insert into plan_version_prices(plan_version_id,cycle,currency,amount_ht_minor) select ${id}::uuid,cycle,currency,amount_ht_minor from plan_version_prices where plan_version_id=(select id from plan_versions where plan_code='business' and version_number=1)`
    return id
  }
  const publish = (id: string) =>
    fixture.client`update plan_versions set status='published',published_at=now(),published_by='test:operator' where id=${id}`

  it('snapshots all legacy values/prices and reconstructs the existing DTO without changing customer rows', async () => {
    const source = await fixture.client`select * from subscription_plans order by code`
    const counts =
      await fixture.client`select (select count(*) from plan_entitlements) n,(select count(*) from plan_version_prices) p`
    expect(counts[0]).toMatchObject({ n: '44', p: '6' })
    const repo = createCatalogRepository()
    for (const p of source) {
      const [v] =
        await fixture.client`select id,source_snapshot,source_hash from plan_versions where plan_code=${p.code} and version_number=1`
      const catalog = await fixture.db.transaction((tx) => repo.version(String(v!.id), tx))
      expect(compareCatalogVersion(catalog!)).toEqual({
        code: p.code,
        name: p.name,
        rank: p.rank,
        entitlements: p.entitlements,
        monthlyHt: p.monthly_ht,
        annualHt: p.annual_ht,
      })
      expect(v!.source_snapshot).toEqual({ ...p, currency: 'MAD' })
      expect(v!.source_hash).toMatch(/^[a-f0-9]{64}$/)
    }
    expect(await fixture.client`select * from subscription_plans order by code`).toEqual(source)
    const [audit] =
      await fixture.client`select count(*) n from platform_admin_audit where action='subscription_catalog.publish'`
    expect(audit!.n).toBe('4')
  })

  it('fails closed in the comparison adapter on missing or corrupted values', async () => {
    const [v] = await fixture.client`select id from plan_versions where plan_code='pro'`
    const catalog = await fixture.db.transaction((tx) =>
      createCatalogRepository().version(String(v!.id), tx),
    )
    expect(() => compareCatalogVersion({ ...catalog!, values: catalog!.values.slice(1) })).toThrow(
      /Invalid subscription catalog/,
    )
    const invalid = structuredClone(catalog!)
    invalid.values.find((v) => v.key === 'storageBytes')!.isUnlimited = true
    expect(() => compareCatalogVersion(invalid)).toThrow(/Invalid subscription catalog/)
  })

  it('ignores unrelated legacy columns while retaining the explicit provenance projection', async () => {
    await fixture.client`alter table subscription_plans add column unrelated_note text default 'unrelated metadata'`
    const [v] = await fixture.client`select id from plan_versions where plan_code='business'`
    const catalog = await fixture.db.transaction((tx) =>
      createCatalogRepository().version(String(v!.id), tx),
    )
    expect(compareCatalogVersion(catalog!)).toMatchObject({ code: 'business', monthlyHt: 29900 })
    expect(() =>
      compareCatalogVersion({
        ...catalog!,
        version: { ...catalog!.version, sourceSnapshot: null, sourceHash: null },
      }),
    ).toThrow(/no imported source provenance/)
  })

  it('detects legacy price, entitlement and currency drift without changing live runtime data', async () => {
    const [v] = await fixture.client`select id from plan_versions where plan_code='business'`
    for (const mutation of [
      "update subscription_plans set monthly_ht=monthly_ht+1 where code='business'",
      "update subscription_plans set entitlements=jsonb_set(entitlements,'{staffPerOrganization}','8') where code='business'",
      "update billing_settings set currency='USD'",
    ]) {
      await fixture.client`update subscription_plans set monthly_ht=29900,entitlements=jsonb_set(entitlements,'{staffPerOrganization}','5') where code='business'`
      await fixture.client`update billing_settings set currency='MAD'`
      await fixture.client.unsafe(mutation)
      const sourceAfterEdit =
        await fixture.client`select to_jsonb(p) row from subscription_plans p order by code`
      await fixture.db.transaction(async (tx) => {
        const catalog = await createCatalogRepository().version(String(v!.id), tx)
        expect(() => compareCatalogVersion(catalog!)).toThrow(
          new RegExp(`catalog drift for version ${v!.id}`),
        )
      })
      expect(
        await fixture.client`select to_jsonb(p) row from subscription_plans p order by code`,
      ).toEqual(sourceAfterEdit)
    }
    const [live] =
      await fixture.client`select monthly_ht,entitlements from subscription_plans where code='business'`
    expect(live!.monthly_ht).toBe(29900)
    expect(live!.entitlements.staffPerOrganization).toBe(5)
  })

  it('enforces exclusive typed values, permitted unlimited and trial price rules', async () => {
    const id = await draft()
    await expect(
      fixture.client`update plan_entitlements set integer_value=null where plan_version_id=${id} and entitlement_key='storageBytes'`,
    ).rejects.toThrow()
    await expect(
      fixture.client`update plan_entitlements set integer_value=-1 where plan_version_id=${id} and entitlement_key='storageBytes'`,
    ).rejects.toThrow()
    await expect(
      fixture.client`update plan_entitlements set integer_value=9007199254740992 where plan_version_id=${id} and entitlement_key='storageBytes'`,
    ).rejects.toThrow()
    await expect(
      fixture.client`update plan_entitlements set integer_value=null,is_unlimited=true where plan_version_id=${id} and entitlement_key='storageBytes'`,
    ).rejects.toThrow(/Unlimited/)
    await expect(
      fixture.client`update plan_entitlements set value_type='boolean' where plan_version_id=${id} and entitlement_key='storageBytes'`,
    ).rejects.toThrow()
    await expect(
      fixture.client`update plan_version_prices set currency='USD' where plan_version_id=${id}`,
    ).rejects.toThrow()
    const [trial] =
      await fixture.client`insert into plan_versions(plan_code,version_number,display_name,rank) values ('trial',2,'Trial draft',0) returning id`
    await expect(
      fixture.client`insert into plan_version_prices(plan_version_id,cycle,amount_ht_minor) values (${trial!.id},'monthly',0)`,
    ).rejects.toThrow(/Trial/)
  })

  it('rejects incomplete/direct publication and records successful publication atomically', async () => {
    const id = await draft()
    await fixture.client`delete from plan_entitlements where plan_version_id=${id} and entitlement_key='storageBytes'`
    await expect(publish(id)).rejects.toThrow(/eleven/)
    await fixture.client`insert into plan_entitlements values (${id},'storageBytes','integer',null,10000000000,false)`
    await fixture.client`delete from plan_version_prices where plan_version_id=${id} and cycle='annual'`
    await expect(publish(id)).rejects.toThrow(/prices/)
    await fixture.client`insert into plan_version_prices(plan_version_id,cycle,amount_ht_minor) values (${id},'annual',299000)`
    await fixture.client.begin(async (tx) => {
      await tx`select set_config('app.actor_type','owner',true)`
      const [before] = await tx`select clock_timestamp() at`
      const [published] =
        await tx`update plan_versions set status='published',published_at='2000-01-01',published_by='test:declared-claim' where id=${id} returning published_at`
      expect(new Date(published!.published_at).getTime()).toBeGreaterThanOrEqual(
        new Date(before!.at).getTime(),
      )
      const [context] =
        await tx`select current_setting('app.actor_type') actor,current_user db_user,session_user session_identity,txid_current()::text txid`
      expect(context!.actor).toBe('owner')
      const [audit] = await tx`select actor,after from platform_admin_audit where target_id=${id}`
      expect(audit!.actor).toBe('test:declared-claim')
      expect(audit!.after.publication_identity).toMatchObject({
        current_user: context!.db_user,
        session_user: context!.session_identity,
        transaction_id: context!.txid,
        declared_actor: 'test:declared-claim',
      })
      expect(new Date(audit!.after.publication_identity.server_timestamp)).toEqual(
        new Date(published!.published_at),
      )
    })
    await expect(
      fixture.client`insert into plan_versions(plan_code,version_number,status,display_name,rank,published_at,published_by) values ('pro',2,'published','Invalid',3,now(),'test')`,
    ).rejects.toThrow(/draft/)
    const [audit] =
      await fixture.client`select count(*) n from platform_admin_audit where target_id=${id}`
    expect(audit!.n).toBe('1')
  })

  it('protects all published paths including definitions, identity, prices and truncate', async () => {
    const [v] = await fixture.client`select id from plan_versions where plan_code='pro'`
    const id = String(v!.id)
    for (const query of [
      fixture.client`update plan_versions set display_name='Changed' where id=${id}`,
      fixture.client`delete from plan_versions where id=${id}`,
      fixture.client`update plan_entitlements set integer_value=1 where plan_version_id=${id}`,
      fixture.client`delete from plan_version_prices where plan_version_id=${id}`,
      fixture.client`update entitlement_definitions set scope='owner' where key='staffPerOrganization'`,
      fixture.client`delete from entitlement_definitions where key='staffPerOrganization'`,
      fixture.client`truncate plan_version_prices`,
    ])
      await expect(query).rejects.toThrow(/immutable|forbidden/)
  })

  it('serializes concurrent edit/publication and rejects a second publish', async () => {
    const id = await draft()
    const outcomes = await Promise.allSettled([
      publish(id),
      fixture.client`update plan_entitlements set integer_value=6 where plan_version_id=${id} and entitlement_key='staffPerOrganization'`,
    ])
    expect(outcomes[0]!.status).toBe('fulfilled')
    const [v] = await fixture.client`select status from plan_versions where id=${id}`
    expect(v!.status).toBe('published')
    await expect(publish(id)).rejects.toThrow(/immutable/)
    const [a] =
      await fixture.client`select count(*) n from platform_admin_audit where target_id=${id}`
    expect(a!.n).toBe('1')
    const other = await draft(3)
    const publishes = await Promise.allSettled([publish(other), publish(other)])
    expect(publishes.filter((p) => p.status === 'fulfilled')).toHaveLength(1)
  })

  it('bounds owner/staff/worker reads to published versions and denies runtime DML even in admin context', async () => {
    const id = await draft()
    const [schema] = await fixture.client`select current_schema() name`
    const name = String(schema!.name)
    for (const table of [
      'entitlement_definitions',
      'plan_versions',
      'plan_entitlements',
      'plan_version_prices',
    ])
      await fixture.client.unsafe(`grant select on "${name}".${table} to "${fixture.role}"`)
    for (const actor of ['owner', 'worker', 'platform_admin', 'staff']) {
      await fixture.client.begin(async (tx) => {
        await tx.unsafe(`set local role "${fixture.role}"`)
        await tx`select set_config('app.actor_type',${actor},true)`
        const rows = await tx`select id from plan_versions where id=${id}`
        expect(rows.length).toBe(actor === 'platform_admin' ? 1 : 0)
      })
    }
    await expect(
      fixture.client.begin(async (tx) => {
        await tx.unsafe(`set local role "${fixture.role}"`)
        await tx`select set_config('app.actor_type','platform_admin',true)`
        await tx`update plan_versions set display_name='Bypass' where id=${id}`
      }),
    ).rejects.toThrow(/permission denied/)
    // Even an accidental DML grant cannot bypass the migration-role statement guard.
    await fixture.client.unsafe(`grant update on "${name}".plan_versions to "${fixture.role}"`)
    await expect(
      fixture.client.begin(async (tx) => {
        await tx.unsafe(`set local role "${fixture.role}"`)
        await tx`select set_config('app.actor_type','platform_admin',true)`
        await tx`update plan_versions set display_name='Bypass' where id=${id}`
      }),
    ).rejects.toThrow(/migration role/)
  })

  it('fails import on malformed/unsupported values instead of coercing or replacing them', async () => {
    const sql = await reference()
    for (const mutation of [
      "update subscription_plans set entitlements=jsonb_set(entitlements,'{storageBytes}','null') where code='business'",
      "update subscription_plans set entitlements=entitlements || '{\"extra\":1}'::jsonb where code='business'",
      "update subscription_plans set entitlements=jsonb_set(entitlements,'{features}','[\"unknown\"]') where code='business'",
      "update subscription_plans set entitlements=jsonb_set(entitlements,'{staffPerOrganization}','1.5') where code='business'",
      "update billing_settings set currency='USD'",
    ]) {
      await expect(
        fixture.client.begin(async (tx) => {
          await tx.unsafe(mutation)
          await tx.unsafe(sql)
        }),
      ).rejects.toThrow(/Invalid|Unknown|supports MAD/)
    }
  })
})
