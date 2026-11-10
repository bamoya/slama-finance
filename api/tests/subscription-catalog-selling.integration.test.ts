import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createCatalogRepository } from '../src/modules/platform/subscriptions/repositories/catalog.repository.js'
import { createCatalogReader } from '../src/modules/platform/subscriptions/services/catalog-values.service.js'
import { isolatedDatabase, testOwnerId } from './helpers/postgres.js'

describe('Selling versions and coverage version pins', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })

  const version = async (plan: string, number = 1) =>
    String(
      (
        await fixture.client`select id from plan_versions where plan_code=${plan} and version_number=${number}`
      )[0]!.id,
    )
  async function draft(plan = 'business', number = 2) {
    const [v] =
      await fixture.client`insert into plan_versions(plan_code,version_number,display_name,rank) values (${plan},${number},'Business v2',2) returning id`
    const id = String(v!.id)
    const v1 = await version(plan)
    await fixture.client`insert into plan_entitlements select ${id}::uuid,entitlement_key,value_type,boolean_value,integer_value,is_unlimited from plan_entitlements where plan_version_id=${v1}`
    await fixture.client`insert into plan_version_prices(plan_version_id,cycle,currency,amount_ht_minor) select ${id}::uuid,cycle,currency,amount_ht_minor+100 from plan_version_prices where plan_version_id=${v1}`
    return id
  }
  const publish = (id: string) =>
    fixture.client`update plan_versions set status='published',published_at=now(),published_by='test:operator' where id=${id}`
  const sell = (plan: string, id: string | null) =>
    fixture.client`update plan_selling set plan_version_id=${id},changed_by='test:operator' where plan_code=${plan}`
  const selling = async (plan: string) =>
    (await fixture.client`select plan_version_id from plan_selling where plan_code=${plan}`)[0]!
      .plan_version_id
  const admin = <T>(work: (tx: typeof fixture.client) => Promise<T>) =>
    fixture.client.begin(async (tx) => {
      await tx`select set_config('app.actor_type','platform_admin',true)`
      return work(tx as unknown as typeof fixture.client)
    }) as Promise<T>
  const payment = (tx: typeof fixture.client, plan: string, versionId: string, reference: string) =>
    tx`insert into subscription_payments(owner_id,plan_code,plan_version_id,cycle,kind,status,method,reference,currency,amount_ht,tax_amount,amount_ttc,coverage_start,coverage_end,decided_at)
       values (${testOwnerId},${plan},${versionId},'monthly','activation','confirmed','cash',${reference},'MAD',100,0,100,now()+interval '40 days',now()+interval '70 days',now()) returning id`

  it('seeds one audited selling version per plan and pins trial starts to the selling trial', async () => {
    const rows =
      await fixture.client`select s.plan_code,v.version_number,v.status from plan_selling s join plan_versions v on v.id=s.plan_version_id order by s.plan_code`
    expect(rows.map((r) => [r.plan_code, r.version_number, r.status])).toEqual([
      ['business', 1, 'published'],
      ['essential', 1, 'published'],
      ['pro', 1, 'published'],
      ['trial', 1, 'published'],
    ])
    const [audit] =
      await fixture.client`select count(*) n from platform_admin_audit where action='subscription_catalog.select'`
    expect(audit!.n).toBe('4')
    const trial = await version('trial')
    const [pins] =
      await fixture.client`select s.trial_plan_version_id t,p.plan_version_id p from owner_subscriptions s join subscription_periods p on p.owner_id=s.owner_id and p.kind='trial' where s.owner_id=${testOwnerId}`
    expect(pins).toEqual({ t: trial, p: trial })
    await expect(
      admin(
        (tx) =>
          tx`update owner_subscriptions set trial_plan_version_id=${trial} where owner_id=${testOwnerId}`,
      ),
    ).resolves.toBeDefined()
    const business = await version('business')
    await expect(
      admin(
        (tx) =>
          tx`update owner_subscriptions set trial_plan_version_id=${business} where owner_id=${testOwnerId}`,
      ),
    ).rejects.toThrow(/trial version pin is immutable/)
  })

  it('never repins on publication; selection and withdrawal are published-only, audited and permanent-history', async () => {
    const v1 = await version('business')
    const v2 = await draft()
    await expect(sell('business', v2)).rejects.toThrow(/published version of the same plan/)
    await publish(v2)
    expect(await selling('business')).toBe(v1)
    await expect(sell('business', await version('pro'))).rejects.toThrow()
    await expect(sell('business', v1)).rejects.toThrow(/does not change/)
    await sell('business', v2)
    await sell('business', null)
    await expect(sell('trial', null)).rejects.toThrow(/plan_selling_trial/)
    await expect(
      fixture.client`delete from plan_selling where plan_code='business'`,
    ).rejects.toThrow(/deletion is forbidden/)
    const audit =
      await fixture.client`select action,target_id,actor,(after->>'plan_version_id') v from platform_admin_audit where target_type='plan_selling' and target_id='business' order by created_at`
    expect(audit.map((a) => [a.action, a.actor, a.v])).toEqual([
      ['subscription_catalog.select', 'migration:subscription-catalog-v1', v1],
      ['subscription_catalog.select', 'test:operator', v2],
      ['subscription_catalog.withdraw', 'test:operator', null],
    ])
  })

  it('serializes selection against publication of the same draft', async () => {
    const v2 = await draft()
    const [published, selected] = await Promise.allSettled([publish(v2), sell('business', v2)])
    expect(published.status).toBe('fulfilled')
    const [state] = await fixture.client`select status from plan_versions where id=${v2}`
    expect(state!.status).toBe('published')
    expect(await selling('business')).toBe(
      selected.status === 'fulfilled' ? v2 : await version('business'),
    )
  })

  it('lets runtime actors read the selling pointer but never change it, even after a grant', async () => {
    const [schema] = await fixture.client`select current_schema() name`
    const name = String(schema!.name)
    await fixture.client.unsafe(`grant select on "${name}".plan_selling to "${fixture.role}"`)
    for (const actor of ['owner', 'worker', 'platform_admin'])
      await fixture.client.begin(async (tx) => {
        await tx.unsafe(`set local role "${fixture.role}"`)
        await tx`select set_config('app.actor_type',${actor},true)`
        expect((await tx`select plan_code from plan_selling`).length).toBe(4)
      })
    const attempt = () =>
      fixture.client.begin(async (tx) => {
        await tx.unsafe(`set local role "${fixture.role}"`)
        await tx`select set_config('app.actor_type','platform_admin',true)`
        await tx`update plan_selling set plan_version_id=null,changed_by='bypass' where plan_code='pro'`
      })
    await expect(attempt()).rejects.toThrow(/permission denied/)
    await fixture.client.unsafe(`grant update on "${name}".plan_selling to "${fixture.role}"`)
    await expect(attempt()).rejects.toThrow(/migration role/)
  })

  it('pins payments and their periods immutably and keeps withdrawn pins valid', async () => {
    const v1 = await version('business')
    const v2 = await draft()
    await expect(admin((tx) => payment(tx, 'business', v2, 'draft-pin'))).rejects.toThrow(
      /published paid plan version/,
    )
    await expect(admin((tx) => payment(tx, 'pro', v1, 'cross-plan'))).rejects.toThrow(/foreign key/)
    await publish(v2)
    const [p] = await admin((tx) => payment(tx, 'business', v1, 'v1-pin'))
    // Withdrawal and a newer selling version leave the paid pin and its future period untouched.
    await sell('business', v2)
    await sell('business', null)
    await expect(
      admin(
        (tx) =>
          tx`insert into subscription_periods(owner_id,kind,plan_code,plan_version_id,cycle,starts_at,ends_at,source,payment_id)
             select owner_id,'paid',plan_code,${v2},cycle,coverage_start,coverage_end,'payment',id from subscription_payments where id=${p!.id}`,
      ),
    ).rejects.toThrow(/version of its payment/)
    await admin(
      (tx) =>
        tx`insert into subscription_periods(owner_id,kind,plan_code,cycle,starts_at,ends_at,source,payment_id)
           select owner_id,'paid',plan_code,cycle,coverage_start,coverage_end,'payment',id from subscription_payments where id=${p!.id}`,
    )
    const [period] =
      await fixture.client`select plan_version_id from subscription_periods where payment_id=${p!.id}`
    expect(period!.plan_version_id).toBe(v1)
    await expect(
      admin((tx) => tx`update subscription_payments set plan_version_id=${v2} where id=${p!.id}`),
    ).rejects.toThrow(/pin is immutable/)
    await expect(
      admin(
        (tx) => tx`update subscription_periods set plan_version_id=${v2} where payment_id=${p!.id}`,
      ),
    ).rejects.toThrow(/single supersession/)
    const reader = createCatalogReader(createCatalogRepository())
    const terms = await fixture.db.transaction((tx) => reader.pinned(v1, tx))
    expect(terms).toMatchObject({ planCode: 'business', versionNumber: 1 })
    expect(terms.prices).toEqual({ monthly: 29900, annual: 299000 })
  })

  it('requires published targets and 30 days of notice for version transitions', async () => {
    const v2 = await draft()
    const transition = (target: string, noticeDays: number) =>
      admin(
        (tx) =>
          tx`insert into subscription_scheduled_changes(owner_id,kind,effective_at,target_plan_code,target_plan_version_id,notice_sent_at,created_by,actor_admin_id)
             values (${testOwnerId},'version_transition',now()+interval '30 days',${'business'},${target},now()+interval '30 days'-${`${noticeDays} days`}::interval,'migration',null)`,
      )
    await expect(transition(v2, 30)).rejects.toThrow(/targets a published version/)
    await publish(v2)
    await expect(transition(v2, 29)).rejects.toThrow(/subscription_scheduled_change_target/)
    await expect(
      admin(
        (tx) =>
          tx`insert into subscription_scheduled_changes(owner_id,kind,effective_at,target_plan_code,target_plan_version_id,notice_sent_at,created_by)
             values (${testOwnerId},'version_transition',now()+interval '31 days','pro',${v2},now(),'migration')`,
      ),
    ).rejects.toThrow(/foreign key/)
    await transition(v2, 30)
    // Publication never creates or retargets a transition.
    expect(await selling('business')).toBe(await version('business'))
  })

  it('reads typed terms only from published versions and fails closed otherwise', async () => {
    const reader = createCatalogReader(createCatalogRepository())
    const read = <T>(work: Parameters<typeof fixture.db.transaction<T>>[0]) =>
      fixture.db.transaction(work)
    const pro = await read((tx) => reader.selling('pro', tx))
    expect(pro.entitlements).toMatchObject({ organizations: null, staffPerOrganization: null })
    const trial = await read((tx) => reader.selling('trial', tx))
    expect(trial.prices).toBeNull()
    const v2 = await draft()
    await expect(read((tx) => reader.pinned(v2, tx))).rejects.toMatchObject({
      statusCode: 503,
      code: 'SUBSCRIPTION_CATALOG_UNAVAILABLE',
    })
    await expect(
      read((tx) => reader.pinned('00000000-0000-4000-8000-000000000000', tx)),
    ).rejects.toMatchObject({ code: 'SUBSCRIPTION_CATALOG_UNAVAILABLE' })
    const v1 = await version('business')
    await sell('business', null)
    await expect(read((tx) => reader.selling('business', tx))).rejects.toMatchObject({
      statusCode: 409,
      code: 'PLAN_NOT_SELLABLE',
    })
    expect((await read((tx) => reader.sellingPaid(tx))).map((t) => t.planCode)).toEqual([
      'essential',
      'pro',
    ])
    expect((await read((tx) => reader.pinned(v1, tx))).versionNumber).toBe(1)
  })
})
