import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { users } from '../db/schema/auth.js'
import { inTransaction } from '../src/lib/db.js'
import { writeAudit } from '../src/modules/audit/writer.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

describe('PostgreSQL transaction and audit foundation', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  beforeAll(async () => {
    fixture = await isolatedDatabase()
  })
  afterAll(async () => {
    await fixture?.cleanup()
  })

  it('rolls back both the business update and audit insertion', async () => {
    await expect(
      inTransaction(fixture.db, async (tx) => {
        await tx.update(users).set({ firstName: 'Must roll back' }).where(eq(users.id, testUserId))
        await writeAudit(tx, {
          actorKind: 'user',
          actorUserId: testUserId,
          action: 'update',
          entityTable: 'users',
          entityKey: { id: testUserId },
          afterValues: { firstName: 'Must roll back', passwordHash: 'secret' },
        })
        throw new Error('Simulated failure')
      }),
    ).rejects.toThrow('Simulated failure')
    expect(
      (await fixture.client`select first_name from users where id=${testUserId}`)[0]?.first_name,
    ).toBe('Test')
    expect(await fixture.client`select * from audit_events`).toHaveLength(0)
  })
  it('commits a safe event under an insert/read-only audit role', async () => {
    await inTransaction(fixture.db, async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE "${fixture.role}"`))
      await tx.update(users).set({ firstName: 'Updated operator' }).where(eq(users.id, testUserId))
      await writeAudit(tx, {
        actorKind: 'user',
        actorUserId: testUserId,
        action: 'update',
        entityTable: 'users',
        entityKey: { id: testUserId },
        afterValues: {
          firstName: 'Updated operator',
          passwordHash: 'secret',
          body: 'private email',
        },
      })
    })
    expect((await fixture.client`select after_values from audit_events`)[0]?.after_values).toEqual({
      firstName: 'Updated operator',
    })
    for (const operation of [
      "UPDATE audit_events SET action = 'tampered'",
      'DELETE FROM audit_events',
    ]) {
      await expect(
        inTransaction(fixture.db, async (tx) => {
          await tx.execute(sql.raw(`SET LOCAL ROLE "${fixture.role}"`))
          await tx.execute(sql.raw(operation))
        }),
      ).rejects.toMatchObject({ code: '42501' })
    }
  })
  it('isolates simultaneous fixtures and preserves real constraints', async () => {
    const second = await isolatedDatabase()
    try {
      expect(
        (await second.client`select first_name from users where id=${testUserId}`)[0]?.first_name,
      ).toBe('Test')
      await expect(
        second.client`insert into users (email, password_hash) values ('operator@example.test', 'fixture')`,
      ).rejects.toMatchObject({ code: '23505' })
    } finally {
      await second.cleanup()
    }
  })
})
