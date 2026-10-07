import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ObjectStorage } from '../src/integrations/contracts.js'
import { createRecordingEmailProvider } from '../src/integrations/email/transport.js'
import { createArtifactRepository } from '../src/support/artifacts/repositories/artifact.repository.js'
import {
  type ComposedMessage,
  createNotificationSupport,
} from '../src/support/notifications/index.js'
import { createNotificationRepository } from '../src/support/notifications/repositories/notification.repository.js'
import { isolatedDatabase } from './helpers/postgres.js'

const key = 'artifacts/invoice/11111111-1111-4111-8111-111111111111.pdf'
const storage: ObjectStorage = {
  putImmutable: async () => {
    throw new Error('not used')
  },
  get: async () => new Uint8Array([1, 2, 3]),
  signedDownloadUrl: async () => {
    throw new Error('not used')
  },
  deleteUnreferenced: async () => {},
}
const input = (): ComposedMessage => ({
  idempotencyKey: `test:${randomUUID()}`,
  actor: null,
  from: { email: 'sender@example.test', name: 'Finance' },
  to: 'client@example.test',
  cc: [],
  subject: 'Private document',
  html: '<p>Private</p>',
  text: 'Private',
  attachments: [],
})

describe('durable notification delivery', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
  })
  afterEach(async () => {
    await fixture?.cleanup()
  })
  function setup() {
    let now = new Date(Date.now() + 5000)
    const provider = createRecordingEmailProvider()
    const support = createNotificationSupport(() => fixture.db, storage, provider, {
      allowedFrom: ['sender@example.test'],
      clock: () => now,
    })
    return {
      provider,
      support,
      repo: createNotificationRepository(() => fixture.db),
      advance: (ms: number) => {
        now = new Date(now.getTime() + ms)
      },
      now: () => now,
    }
  }
  it('deduplicates same content, rejects changed content and two workers claim once', async () => {
    const f = setup(),
      p = input()
    const first = await f.support.enqueue(p)
    expect((await f.support.enqueue(p)).id).toBe(first.id)
    await expect(f.support.enqueue({ ...p, subject: 'changed' })).rejects.toMatchObject({
      code: 'MESSAGE_CONFLICT',
    })
    await Promise.all([f.support.worker.runOne(), f.support.worker.runOne()])
    expect(f.provider.messages).toHaveLength(1)
    expect(await f.support.status(first.id)).toMatchObject({ status: 'sent', attempts: 1 })
  })
  it('recovers provider acceptance after a crash with the same key and fences stale completions', async () => {
    const f = setup(),
      p = input()
    const row = await f.support.enqueue(p)
    const claimed = await f.repo.transaction((tx) => f.repo.claim(f.now(), randomUUID(), tx))
    expect(claimed?.id).toBe(row.id)
    await f.provider.send({ ...p, attachments: [] })
    f.advance(31_000)
    await f.support.worker.runOne()
    expect(f.provider.messages).toHaveLength(1)
    expect(await f.support.status(row.id)).toMatchObject({ status: 'sent', attempts: 2 })
    await expect(
      f.repo.transaction((tx) => f.repo.fence(claimed!, f.now(), { status: 'failed' }, tx)),
    ).rejects.toMatchObject({ code: 'STALE_MESSAGE_LEASE' })
  })
  it('makes final-attempt crashed or expired provider horizons visible and refuses unsafe resend', async () => {
    const f = setup(),
      p = input()
    const row = await f.support.enqueue(p)
    await fixture.client`update outbound_messages set max_attempts=1 where id=${row.id}`
    await f.repo.transaction((tx) => f.repo.claim(f.now(), randomUUID(), tx))
    f.advance(31_000)
    expect(await f.support.worker.runOne()).toBe(false)
    expect(await f.support.status(row.id)).toMatchObject({
      status: 'failed',
      lastErrorCode: 'PROVIDER_OUTCOME_UNCERTAIN',
    })
    await expect(f.support.retry(row.id)).rejects.toMatchObject({
      code: 'PROVIDER_OUTCOME_UNCERTAIN',
    })
  })
  it('cancellation races claims atomically and never changes accepted mail', async () => {
    const f = setup()
    const row = await f.support.enqueue(input())
    const outcomes = await Promise.allSettled([f.support.cancel(row.id), f.support.worker.runOne()])
    expect(outcomes).toHaveLength(2)
    const final = await f.support.status(row.id)
    expect(['sent', 'cancelled']).toContain(final.status)
    await expect(f.support.cancel(row.id)).rejects.toMatchObject({
      code: 'MESSAGE_ALREADY_CLAIMED',
    })
  })
  it('attachment pins and orphan deletion serialize on the same key', async () => {
    const f = setup(),
      repo = createArtifactRepository(() => fixture.db)
    let pinned!: () => void, release!: () => void
    const locked = new Promise<void>((resolve) => {
      pinned = resolve
    })
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const enqueue = fixture.db.transaction(async (tx) => {
      await tx.execute(
        (await import('drizzle-orm'))
          .sql`select pg_advisory_xact_lock(hashtextextended(${key},91036))`,
      )
      pinned()
      await gate
      return f.support.enqueue(
        {
          ...input(),
          attachments: [
            {
              objectKey: key,
              filename: 'invoice.pdf',
              contentType: 'application/pdf',
              byteSize: 3,
              position: 0,
            },
          ],
        },
        tx,
      )
    })
    await locked
    let deleted = false
    const cleanup = repo.deleteIfUnreferenced(key, async () => {
      deleted = true
    })
    release()
    await enqueue
    expect(await cleanup).toBe(false)
    expect(deleted).toBe(false)
    expect((await repo.referencedKeys([key])).has(key)).toBe(true)
  })
})
