import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
    // A host clock ahead of the database cannot complete a lease the database says is current.
    await skewHost(+120_000)
    await expect(jobs.complete(claimed!)).resolves.toMatchObject({ status: 'succeeded' })
  })

  it('schedules retry backoff on the database clock, whatever the host clock says', async () => {
    const queued = await jobs.enqueuePdf(payload(2), null)
    const claimed = (await jobs.claim())!
    expect(claimed.id).toBe(queued.id)
    await skewHost(-3_600_000)
    await jobs.fail(claimed, 'TRANSIENT')
    const [row] = await fixture.client<
      { status: string; backoff_ms: number }[]
    >`select status, (extract(epoch from available_at-now())*1000)::float8 as backoff_ms from background_jobs where id=${queued.id}`
    expect(row!.status).toBe('queued')
    // First retry: 60 s plus up to 1 s of jitter after the database instant, not the host's.
    expect(row!.backoff_ms).toBeGreaterThanOrEqual(59_000)
    expect(row!.backoff_ms).toBeLessThanOrEqual(61_500)
    expect(await jobs.claim()).toBeNull()
  })

  it('still honours an injected instant for tests that fake time', async () => {
    await jobs.enqueuePdf(payload(3), null)
    expect(await jobs.claim(new Date(Date.now() - 3_600_000))).toBeNull()
    expect(await jobs.claim(new Date(Date.now() + 3_600_000))).not.toBeNull()
  })
})
