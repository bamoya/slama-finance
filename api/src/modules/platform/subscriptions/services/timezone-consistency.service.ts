import { AppError } from '../../../../lib/errors.js'
import type { createTimezoneRepository } from '../repositories/timezone.repository.js'
import { billingTimezone, zoneOffset } from './billing-calendar.service.js'

export type TimezoneReport = {
  zone: string
  status: 'consistent' | 'mismatch' | 'unchecked'
  checkedAt: string | null
  mismatches: number
  /** First disagreeing instants (for logs), never used for date math. */
  samples: { at: string; application: number; database: number }[]
}
/** Returns the database offsets (ms) for the given instants in `zone`. */
export type DatabaseOffsets = (instants: Date[], zone: string) => Promise<number[]>

/**
 * Reference set derived from the clock: noon UTC on every day from 1 January of the previous year
 * to two years ahead (covers every offset change, including the Ramadan periods, that current and
 * near-future periods can touch). No offset is hard-coded: both sources are compared directly.
 */
export function referenceInstants(now = new Date()) {
  const instants: Date[] = []
  const from = Date.UTC(now.getUTCFullYear() - 1, 0, 1, 12)
  const to = Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth(), now.getUTCDate(), 12)
  for (let t = from; t <= to; t += 86_400_000) instants.push(new Date(t))
  return instants
}

export async function compareTimezoneData(
  database: DatabaseOffsets,
  zone = billingTimezone,
  now = new Date(),
  instants = referenceInstants(now),
): Promise<TimezoneReport> {
  const db = await database(instants, zone)
  const samples: TimezoneReport['samples'] = []
  let mismatches = 0
  instants.forEach((at, index) => {
    const application = zoneOffset(at, zone)
    if (application === db[index]) return
    mismatches++
    if (samples.length < 5)
      samples.push({ at: at.toISOString(), application, database: db[index]! })
  })
  return {
    zone,
    status: mismatches ? 'mismatch' : 'consistent',
    checkedAt: now.toISOString(),
    mismatches,
    samples,
  }
}

export const databaseTimezoneCheck = (repo: ReturnType<typeof createTimezoneRepository>) => () =>
  compareTimezoneData((instants, zone) => repo.offsets(instants, zone))

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000, 120_000, 600_000]
const RECHECK_MS = 3_600_000

/**
 * Startup guard. Until a check has succeeded (unchecked) and while the sources disagree (mismatch),
 * writes that compute calendar boundaries refuse with 503; reads stay available. A failing check is
 * retried with bounded backoff, and a successful one is repeated about hourly.
 */
export function createTimezoneGuard(
  check: () => Promise<TimezoneReport>,
  options: {
    onReport?: (report: TimezoneReport) => void
    onError?: (error: unknown) => void
    retryDelaysMs?: number[]
    recheckMs?: number
  } = {},
) {
  let report: TimezoneReport = {
    zone: billingTimezone,
    status: 'unchecked',
    checkedAt: null,
    mismatches: 0,
    samples: [],
  }
  const delays = options.retryDelaysMs ?? RETRY_DELAYS_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  let stopped = false
  const schedule = (ms: number, attempt: number) => {
    if (stopped) return
    timer = setTimeout(() => void cycle(attempt), ms)
    timer.unref?.()
  }
  async function run() {
    report = await check()
    options.onReport?.(report)
    return report
  }
  async function cycle(attempt: number) {
    try {
      await run()
      schedule(options.recheckMs ?? RECHECK_MS, 0)
    } catch (error) {
      // A failed recheck keeps the last known result; only a never-checked guard stays unchecked.
      options.onError?.(error)
      schedule(delays[Math.min(attempt, delays.length - 1)]!, attempt + 1)
    }
  }
  return {
    run,
    /** First attempt now, then retries/rechecks on unref'd timers until stop(). */
    start: () => cycle(0),
    stop() {
      stopped = true
      clearTimeout(timer)
    },
    status: () => report,
    assertWritable() {
      if (report.status === 'mismatch')
        throw new AppError(
          503,
          'TIMEZONE_DATA_MISMATCH',
          'Subscription dates cannot be changed right now: server timezone data is inconsistent.',
        )
      if (report.status === 'unchecked')
        throw new AppError(
          503,
          'TIMEZONE_DATA_UNCHECKED',
          'Subscription dates cannot be changed until the server timezone data has been verified.',
        )
    },
  }
}
export type TimezoneGuard = ReturnType<typeof createTimezoneGuard>
