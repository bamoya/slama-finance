import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createScheduleRepository } from '../src/modules/organization/reporting/schedules/repositories/schedule.repository.js'
import { createJobSupport } from '../src/support/jobs/index.js'
import { isolatedDatabase } from './helpers/postgres.js'

const payload = (n: number) => ({
  documentType: 'invoice' as const,
  documentId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  sourceVersion: 1,
})

// Queues compare and write every instant with the database clock (available_at defaults to now()),
// so a host clock behind or ahead of the database never hides queued work or misplaces backoff.
describe('Queue clock', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let jobs: ReturnType<typeof createJobSupport>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    jobs = createJobSupport(() => fixture.db)
  })
  afterEach(async () => {
    vi.useRealTimers()
    await fixture?.cleanup()
  })
  const dbNow = async () =>
    new Date((await fixture.client<{ t: Date }[]>`select clock_timestamp() as t`)[0]!.t)
  /** Host clock `ms` away from the database; only Date is faked so drivers keep their timers. */
  const skewHost = async (ms: number) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date((await dbNow()).getTime() + ms))
  }

  it('claims a just-enqueued job while the host clock is behind the database', async () => {
    await skewHost(-60_000)
    const queued = await jobs.enqueuePdf(payload(1), null)
    const claimed = await jobs.claim()
    expect(claimed?.id).toBe(queued.id)
    const [row] = await fixture.client<
      { lease_s: number; started_ok: boolean }[]
    >`select extract(epoch from locked_until-started_at)::float8 as lease_s, started_at>=available_at as started_ok from background_jobs where id=${queued.id}`
    expect(row).toEqual({ lease_s: 30, started_ok: true })
  })

  it('schedules retry backoff on the database clock, whatever the host clock says', async () => {
    const queued = await jobs.enqueuePdf(payload(2), null)
    const claimed = (await jobs.claim())!
    expect(claimed.id).toBe(queued.id)
    await skewHost(-3_600_000)
    const before = await dbNow()
    await jobs.fail(claimed, 'TRANSIENT')
    const after = await dbNow()
    const [row] = await fixture.client<
      { status: string; available_at: Date }[]
    >`select status, available_at from background_jobs where id=${queued.id}`
    expect(row!.status).toBe('queued')
    // First retry: exactly 60 s plus [0, 1 s) of jitter after the database instant of the update.
    const availableAt = new Date(row!.available_at).getTime()
    expect(availableAt).toBeGreaterThanOrEqual(before.getTime() + 60_000)
    expect(availableAt).toBeLessThan(after.getTime() + 61_000)
    expect(await jobs.claim()).toBeNull()
  })

  it('still honours an injected instant for tests that fake time', async () => {
    await jobs.enqueuePdf(payload(3), null)
    expect(await jobs.claim(new Date(Date.now() - 3_600_000))).toBeNull()
    expect(await jobs.claim(new Date(Date.now() + 3_600_000))).not.toBeNull()
  })

  it('refuses a stale lease whatever the host clock says, and extends live ones on the DB clock', async () => {
    await jobs.enqueuePdf(payload(4), null)
    const claimed = (await jobs.claim())!
    // Host far behind: the lease is still live on the database clock, so the heartbeat extends it
    // to database now + 30 s (not host now + 30 s, which would already be in the past).
    await skewHost(-3_600_000)
    await jobs.heartbeat(claimed)
    const [extended] = await fixture.client<
      { ahead_s: number }[]
    >`select extract(epoch from locked_until-clock_timestamp())::float8 as ahead_s from background_jobs where id=${claimed.id}`
    expect(extended!.ahead_s).toBeGreaterThan(25)
    expect(extended!.ahead_s).toBeLessThanOrEqual(30)
    // The lease expires on the database clock; a host 1 h behind must not keep it alive.
    await fixture.client`update background_jobs set locked_until=clock_timestamp()-interval '1 second' where id=${claimed.id}`
    await expect(jobs.heartbeat(claimed)).rejects.toMatchObject({ code: 'STALE_JOB_LEASE' })
    await expect(jobs.complete(claimed)).rejects.toMatchObject({ code: 'STALE_JOB_LEASE' })
  })

  it('sweeps an exhausted lease on the database clock even when the host is behind', async () => {
    const queued = await jobs.enqueuePdf(payload(5), null)
    await jobs.claim()
    await fixture.client`update background_jobs set attempts=max_attempts, locked_until=clock_timestamp()-interval '1 second' where id=${queued.id}`
    await skewHost(-3_600_000)
    expect(await jobs.claim()).toBeNull()
    const [row] = await fixture.client<
      { status: string; last_error_code: string; finished: boolean }[]
    >`select status, last_error_code, finished_at is not null as finished from background_jobs where id=${queued.id}`
    expect(row).toEqual({ status: 'failed', last_error_code: 'LEASE_EXHAUSTED', finished: true })
  })

  it('fences a lease that expires while a long caller transaction runs', async () => {
    await jobs.enqueuePdf(payload(6), null)
    const claimed = (await jobs.claim())!
    await expect(
      fixture.db.transaction(async (tx) => {
        // The lease ends 200 ms into this transaction; now() would still be the transaction start.
        await tx.execute(
          sql`update background_jobs set locked_until=clock_timestamp()+interval '200 milliseconds' where id=${claimed.id}`,
        )
        await tx.execute(sql`select pg_sleep(0.4)`)
        await jobs.completeInTransaction(claimed, tx)
      }),
    ).rejects.toMatchObject({ code: 'STALE_JOB_LEASE' })
  })

  it('makes report runs claimable and leased on the database clock', async () => {
    const reports = createScheduleRepository(() => fixture.db)
    const [schedule] =
      await fixture.client`insert into report_schedules(name,frequency,local_time,timezone,period,included_sections)
      values ('Daily','daily','08:00','Africa/Casablanca','previous_day','{summary}') returning *`
    await fixture.db.transaction((tx) =>
      reports.insertRun(
        { ...schedule, id: schedule!.id } as never,
        new Date(),
        { from: '2026-11-10', to: '2026-11-10' },
        undefined,
        tx,
      ),
    )
    await skewHost(-60_000)
    const claimed = await fixture.db.transaction((tx) => reports.claim(undefined, 300_000, tx))
    expect(claimed).not.toBeNull()
    const [row] = await fixture.client<
      { lease_s: number }[]
    >`select extract(epoch from locked_until-started_at)::float8 as lease_s from report_runs where id=${claimed!.id}`
    expect(row!.lease_s).toBeCloseTo(300, 0)
    // Host ahead: the lease is still current on the database clock.
    await skewHost(+3_600_000)
    expect(
      await fixture.db.transaction((tx) =>
        reports.leaseLive(claimed!.id, claimed!.leaseToken!, undefined, tx),
      ),
    ).toBe(true)
  })
})
