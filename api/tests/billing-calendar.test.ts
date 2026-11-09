import { describe, expect, it, vi } from 'vitest'

import {
  addCycle,
  billingMonth,
  billingMonthKey,
  localParts,
  zonedDayStart,
} from '../src/modules/platform/subscriptions/services/billing-calendar.service.js'
import { zoneOffset } from '../src/modules/platform/subscriptions/services/billing-calendar.service.js'
import {
  compareTimezoneData,
  createTimezoneGuard,
  referenceInstants,
} from '../src/modules/platform/subscriptions/services/timezone-consistency.service.js'

describe('billing calendar', () => {
  it('adds local calendar months with month-end clipping and keeps the local time', () => {
    // Europe/Paris has stable, well-known DST data in every runtime.
    const z = 'Europe/Paris'
    expect(addCycle(new Date('2026-01-31T09:00:00Z'), 'monthly', z).toISOString()).toBe(
      '2026-02-28T09:00:00.000Z',
    )
    // Crossing the March DST change keeps 10:00 local (UTC+1 -> UTC+2).
    expect(addCycle(new Date('2026-03-15T09:00:00Z'), 'monthly', z).toISOString()).toBe(
      '2026-04-15T08:00:00.000Z',
    )
    expect(addCycle(new Date('2024-02-29T11:00:00Z'), 'annual', z).toISOString()).toBe(
      '2025-02-28T11:00:00.000Z',
    )
    expect(billingMonth(new Date('2026-03-31T22:30:00Z'), z)).toEqual({
      start: new Date('2026-03-31T22:00:00Z'),
      end: new Date('2026-04-30T22:00:00Z'),
    })
  })
})

describe('Africa/Casablanca around Ramadan 2026 (Node zone data only)', () => {
  const z = 'Africa/Casablanca'
  // Offset changes found from the data itself, not hard-coded.
  const changes: number[] = []
  for (let t = Date.UTC(2026, 0, 1); t < Date.UTC(2026, 5, 1); t += 3_600_000)
    if (zoneOffset(new Date(t), z) !== zoneOffset(new Date(t + 3_600_000), z))
      changes.push(t + 3_600_000)

  it('has a Ramadan start and end change in 2026', () => {
    expect(changes).toHaveLength(2)
  })

  it('starts each transition day at its first local instant', () => {
    for (const change of changes) {
      const day = localParts(new Date(change), z)
      const iso = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
      const start = zonedDayStart(iso, z)
      const l = localParts(start, z)
      expect([l.day, l.hour, l.minute]).toEqual([day.day, 0, 0])
      expect(localParts(new Date(start.getTime() - 1), z).day).not.toBe(day.day)
    }
  })

  it('keeps the local day and time for monthly cycles crossing the Ramadan changes', () => {
    for (const change of changes)
      for (const back of [10, 20, 40]) {
        const start = new Date(change - back * 86_400_000)
        const before = localParts(start, z)
        const after = localParts(addCycle(start, 'monthly', z), z)
        expect([after.day, after.hour, after.minute], start.toISOString()).toEqual([
          before.day,
          before.hour,
          before.minute,
        ])
        expect(after.year * 12 + after.month - (before.year * 12 + before.month)).toBe(1)
      }
  })

  it('keys email allowances by local month, independent of the month start instant', () => {
    // 23:30Z on 31 October is already 1 November wherever the zone is ahead of UTC.
    const late = localParts(new Date('2026-10-31T23:30:00Z'), z)
    expect(billingMonthKey(new Date('2026-10-31T23:30:00Z'), z)).toBe(
      `${late.year}-${String(late.month).padStart(2, '0')}`,
    )
    expect(billingMonthKey(new Date('2026-11-15T12:00:00Z'), z)).toBe('2026-11')
  })
})

describe('timezone data consistency', () => {
  const instants = referenceInstants()
  it('derives the reference range from the clock, without hard-coded expectations', () => {
    const at = referenceInstants(new Date('2030-06-15T00:00:00Z'))
    expect(at[0]!.toISOString()).toBe('2029-01-01T12:00:00.000Z')
    expect(at.at(-1)!.toISOString()).toBe('2032-06-15T12:00:00.000Z')
    expect(instants.length).toBeGreaterThan(900)
  })

  it('reports consistent data when the database agrees with the application', async () => {
    const report = await compareTimezoneData(async (list, zone) =>
      list.map((at) => zoneOffset(at, zone)),
    )
    expect(report).toMatchObject({ status: 'consistent', mismatches: 0, zone: 'Africa/Casablanca' })
    const guard = createTimezoneGuard(async () => report)
    await guard.run()
    expect(() => guard.assertWritable()).not.toThrow()
  })

  it('blocks boundary writes while unchecked, retries a failing check, then allows them', async () => {
    let calls = 0
    const consistent = await compareTimezoneData(async (list, zone) =>
      list.map((at) => zoneOffset(at, zone)),
    )
    const guard = createTimezoneGuard(
      async () => {
        calls++
        if (calls < 3) throw new Error('database unavailable')
        return consistent
      },
      { retryDelaysMs: [5], recheckMs: 60_000 },
    )
    expect(() => guard.assertWritable()).toThrow(
      expect.objectContaining({ statusCode: 503, code: 'TIMEZONE_DATA_UNCHECKED' }),
    )
    await guard.start()
    expect(guard.status().status).toBe('unchecked')
    await vi.waitFor(() => expect(calls).toBe(3))
    await vi.waitFor(() => expect(guard.status().status).toBe('consistent'))
    expect(() => guard.assertWritable()).not.toThrow()
    guard.stop()
  })

  it('reports a mismatch and blocks writes when any reference instant disagrees', async () => {
    const report = await compareTimezoneData(async (list, zone) =>
      list.map((at, index) => zoneOffset(at, zone) + (index === 50 ? 3_600_000 : 0)),
    )
    expect(report.status).toBe('mismatch')
    expect(report.mismatches).toBe(1)
    expect(report.samples[0]!.at).toBe(
      referenceInstants(new Date(report.checkedAt!))[50]!.toISOString(),
    )
    const guard = createTimezoneGuard(async () => report)
    expect(() => guard.assertWritable()).toThrow(
      expect.objectContaining({ code: 'TIMEZONE_DATA_UNCHECKED' }),
    )
    await guard.run()
    expect(() => guard.assertWritable()).toThrow(
      expect.objectContaining({ statusCode: 503, code: 'TIMEZONE_DATA_MISMATCH' }),
    )
  })
})
