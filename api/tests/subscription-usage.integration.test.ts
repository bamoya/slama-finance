import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ObjectStorage } from '../src/integrations/contracts.js'
import { createRecordingEmailProvider } from '../src/integrations/email/transport.js'
import { inTenantScope } from '../src/lib/tenant-database.js'
import { createSubscriptionsModule } from '../src/modules/platform/subscriptions/index.js'
import { createBillingRepository } from '../src/modules/platform/subscriptions/repositories/billing.repository.js'
import { createSubscriptionRepository } from '../src/modules/platform/subscriptions/repositories/subscription.repository.js'
import { createSubscriptionService } from '../src/modules/platform/subscriptions/services/subscription.service.js'
import { createNotificationSupport } from '../src/support/notifications/index.js'
import {
  isolatedDatabase,
  publishPlanVersion,
  seedPaidCoverage,
  testOrganizationId,
  testOwnerId,
} from './helpers/postgres.js'

describe('Pooled subscription usage', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeEach(async () => {
    fixture = await isolatedDatabase({ owner: 'trial' })
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })
  /** Pro coverage pinned to a published version with these allowances (plan JSON is never read). */
  const limits = async (
    storage: number,
    emails: number,
    start = new Date(Date.now() - 86_400_000),
    end = new Date(Date.now() + 30 * 86_400_000),
  ) => {
    const planVersionId = await publishPlanVersion(fixture.client, 'pro', {
      values: { storageBytes: storage, businessEmails: emails },
    })
    await seedPaidCoverage(fixture.db, {
      ownerId: testOwnerId,
      planCode: 'pro',
      planVersionId,
      start,
      end,
      reference: `limits-${storage}-${emails}`,
    })
  }
  const memory = () => {
    const files = new Map<string, Uint8Array>()
    let failWrite = false,
      failDelete = false
    const storage: ObjectStorage = {
      async putImmutable(input) {
        if (failWrite) throw Error('ambiguous write')
        files.set(input.key, input.bytes)
        return {
          key: input.key,
          byteSize: input.bytes.length,
          contentType: input.contentType,
          sha256: 'a'.repeat(64),
        }
      },
      async get(key) {
        return files.get(key)!
      },
      async signedDownloadUrl(key) {
        return key
      },
      async deleteUnreferenced(key) {
        if (failDelete) throw Error('delete failed')
        files.delete(key)
      },
    }
    return {
      storage,
      setWriteFailure: (value: boolean) => {
        failWrite = value
      },
      setDeleteFailure: (value: boolean) => {
        failDelete = value
      },
    }
  }
  it('serializes pooled storage reservations, preserves ambiguous writes and releases only confirmed deletion', async () => {
    await limits(100, 3)
    const subscriptions = createSubscriptionsModule(() => fixture.db),
      m = memory(),
      storage = subscriptions.storage(m.storage)
    const first = `organizations/${testOrganizationId}/media/${randomUUID()}.png`,
      second = `organizations/${testOrganizationId}/media/${randomUUID()}.png`
    const write = (key: string, size: number) =>
      storage.putImmutable({ key, bytes: new Uint8Array(size), contentType: 'image/png' })
    const results = await Promise.allSettled([write(first, 60), write(second, 60)])
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const winner = results[0]!.status === 'fulfilled' ? first : second
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.storageBytes).toBe(60)
    await write(winner, 60)
    await expect(write(winner, 59)).rejects.toMatchObject({ code: 'STORAGE_CONFLICT' })
    m.setWriteFailure(true)
    const pending = `organizations/${testOrganizationId}/media/${randomUUID()}.png`
    await expect(write(pending, 20)).rejects.toThrow('ambiguous write')
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.storageBytes).toBe(80)
    m.setDeleteFailure(true)
    await expect(storage.deleteUnreferenced(winner)).rejects.toThrow('delete failed')
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.storageBytes).toBe(80)
    m.setDeleteFailure(false)
    await storage.deleteUnreferenced(winner)
    await storage.deleteUnreferenced(pending)
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.storageBytes).toBe(0)
  })
  it('queues recipients once, rejects excess atomically and never refunds deletion or retries', async () => {
    await limits(100, 3)
    const subscriptions = createSubscriptionsModule(() => fixture.db),
      m = memory()
    const notifications = createNotificationSupport(
      () => fixture.db,
      m.storage,
      createRecordingEmailProvider(),
      { allowedFrom: ['sender@example.test'], reserveEmail: subscriptions.publicApi.reserveEmail },
    )
    const message = (id: string, cc: string[] = []) => ({
      idempotencyKey: `demo:${id}`,
      actor: null,
      from: { email: 'sender@example.test', name: 'Demo' },
      to: 'client@example.test',
      cc,
      subject: 'Invoice',
      html: '<p>Invoice</p>',
      text: 'Invoice',
      attachments: [],
    })
    const first = await notifications.enqueue(message('first', ['second@example.test']))
    await notifications.enqueue(message('first', ['second@example.test']))
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.businessEmails).toBe(2)
    await expect(
      notifications.enqueue(message('excess', ['second@example.test'])),
    ).rejects.toMatchObject({ code: 'EMAIL_LIMIT' })
    expect(
      await fixture.client`select id from outbound_messages where idempotency_key='demo:excess'`,
    ).toHaveLength(0)
    await notifications.enqueue(message('last'))
    await fixture.client`delete from outbound_messages where id=${first.id}`
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.businessEmails).toBe(3)
    await expect(notifications.enqueue(message('fourth'))).rejects.toMatchObject({
      code: 'EMAIL_LIMIT',
    })
    await fixture.client`update subscription_emails set allowance_key='month:previous',queued_at=now()-interval '2 months'`
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.businessEmails).toBe(0)
    await notifications.enqueue(message('new-month'))
    const summary = await subscriptions.publicApi.summary(testOwnerId)
    expect(summary.usage.businessEmails).toBe(1)
    expect(summary.usage.emailPeriodStart).toBeTruthy()
  })
  it('pools organizations under one owner and isolates different owners', async () => {
    await limits(100, 3)
    const subscriptions = createSubscriptionsModule(() => fixture.db),
      m = memory(),
      storage = subscriptions.storage(m.storage)
    const second = randomUUID(),
      foreign = randomUUID(),
      other = randomUUID()
    await fixture.client`insert into organizations(id,owner_id,name,slug) values(${second},${testOwnerId},'Second','second')`
    await fixture.client`insert into platform_users(id,email,password_hash) values(${other},'other@example.test','not-a-password')`
    await fixture.client`insert into organizations(id,owner_id,name,slug) values(${foreign},${other},'Other','other')`
    await storage.putImmutable({
      key: `organizations/${second}/media/a.png`,
      bytes: new Uint8Array(70),
      contentType: 'image/png',
    })
    await expect(
      storage.putImmutable({
        key: `organizations/${testOrganizationId}/artifacts/a.pdf`,
        bytes: new Uint8Array(31),
        contentType: 'application/pdf',
      }),
    ).rejects.toMatchObject({ code: 'STORAGE_LIMIT' })
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.storageBytes).toBe(70)
    expect((await subscriptions.publicApi.summary(other)).usage.storageBytes).toBe(0)
  })
  it('reconciles only old missing reservations, preserving failed listings and live or recently retried files', async () => {
    await limits(100, 3)
    const subscriptions = createSubscriptionsModule(() => fixture.db),
      m = memory(),
      storage = subscriptions.storage(m.storage)
    const missing = `organizations/${testOrganizationId}/branding/${randomUUID()}.png`,
      present = `organizations/${testOrganizationId}/artifacts/${randomUUID()}.pdf`
    m.setWriteFailure(true)
    await expect(
      storage.putImmutable({ key: missing, bytes: new Uint8Array(20), contentType: 'image/png' }),
    ).rejects.toThrow()
    await expect(
      storage.putImmutable({
        key: present,
        bytes: new Uint8Array(30),
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow()
    await fixture.client`update subscription_storage set touched_at=now()-interval '2 days'`
    await expect(
      inTenantScope(testOrganizationId, () =>
        subscriptions.publicApi.cleanupReservations(async () => {
          throw Error('listing failed')
        }),
      ),
    ).rejects.toThrow('listing failed')
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.storageBytes).toBe(50)
    await inTenantScope(testOrganizationId, () =>
      subscriptions.publicApi.cleanupReservations(async () => [{ key: present }]),
    )
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.storageBytes).toBe(30)
    await expect(
      storage.putImmutable({
        key: present,
        bytes: new Uint8Array(30),
        contentType: 'application/pdf',
      }),
    ).rejects.toThrow()
    await inTenantScope(testOrganizationId, () =>
      subscriptions.publicApi.cleanupReservations(async () => []),
    )
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.storageBytes).toBe(30)
  })
  it('serializes concurrent email admission and gives paid coverage a separate allowance from trial', async () => {
    const subscriptions = createSubscriptionsModule(() => fixture.db),
      m = memory()
    const notifications = createNotificationSupport(
      () => fixture.db,
      m.storage,
      createRecordingEmailProvider(),
      { allowedFrom: ['sender@example.test'], reserveEmail: subscriptions.publicApi.reserveEmail },
    )
    const message = (key: string) => ({
      idempotencyKey: `test:${key}`,
      actor: null,
      from: { email: 'sender@example.test', name: 'Demo' },
      to: 'client@example.test',
      cc: [],
      subject: 'Invoice',
      html: '<p>Invoice</p>',
      text: 'Invoice',
      attachments: [],
    })
    // Trial pool first, then pinned paid coverage: the paid month never counts trial recipients.
    await notifications.enqueue(message('trial'))
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.businessEmails).toBe(1)
    await limits(100, 1)
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.businessEmails).toBe(0)
    const attempts = await Promise.allSettled([
      notifications.enqueue(message('one')),
      notifications.enqueue(message('two')),
    ])
    expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect((await subscriptions.publicApi.summary(testOwnerId)).usage.businessEmails).toBe(1)
  })
  it('resets paid email admission at the next Casablanca calendar month without recounting old retries', async () => {
    await limits(100, 1, new Date('2026-06-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'))
    let now = new Date('2026-06-15T12:00:00Z')
    const service = createSubscriptionService(
        createSubscriptionRepository(() => fixture.db),
        createBillingRepository(() => fixture.db),
        () => now,
      ),
      m = memory()
    const notifications = createNotificationSupport(
      () => fixture.db,
      m.storage,
      createRecordingEmailProvider(),
      { allowedFrom: ['sender@example.test'], reserveEmail: service.reserveEmail },
    )
    const message = (key: string) => ({
      idempotencyKey: `month:${key}`,
      actor: null,
      from: { email: 'sender@example.test', name: 'Demo' },
      to: 'client@example.test',
      cc: [],
      subject: 'Invoice',
      html: '<p>Invoice</p>',
      text: 'Invoice',
      attachments: [],
    })
    await notifications.enqueue(message('june'))
    await expect(notifications.enqueue(message('june-over'))).rejects.toMatchObject({
      code: 'EMAIL_LIMIT',
    })
    const june = await service.summary(testOwnerId)
    now = new Date('2026-07-15T12:00:00Z')
    expect((await service.summary(testOwnerId)).usage.businessEmails).toBe(0)
    const july = await service.summary(testOwnerId)
    expect(july.usage.emailPeriodStart).toBe(june.usage.emailPeriodEnd)
    const [local] =
      await fixture.client`select to_char(${july.usage.emailPeriodStart}::timestamptz at time zone 'Africa/Casablanca','YYYY-MM-DD HH24:MI') value`
    expect(local!.value).toBe('2026-07-01 00:00')
    await notifications.enqueue(message('june'))
    expect((await service.summary(testOwnerId)).usage.businessEmails).toBe(0)
    await notifications.enqueue(message('july'))
    expect((await service.summary(testOwnerId)).usage.businessEmails).toBe(1)
  })
})
