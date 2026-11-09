import { AppError } from '../../../../lib/errors.js'
import { companyDate, defaultTimezone } from '../../../../lib/validation.js'

/**
 * Single source of truth for subscription period and boundary math (S5 slice 0). Every calendar
 * computation uses Node Intl zone data; PostgreSQL only stores and compares the resulting UTC
 * instants. The startup consistency check compares this source with the database's zone data.
 */
export const billingTimezone = defaultTimezone

type Local = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
  ms: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(timezone: string) {
  let f = formatters.get(timezone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timezone, f)
  }
  return f
}

/** Local wall-clock fields of an instant in `timezone`. */
export function localParts(instant: Date, timezone = billingTimezone): Local {
  const parts = formatter(timezone).formatToParts(instant)
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)!.value)
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
    ms: instant.getUTCMilliseconds(),
  }
}

/** UTC offset (ms) in force at an instant; positive east of UTC. */
export function zoneOffset(instant: Date, timezone = billingTimezone) {
  const l = localParts(instant, timezone)
  return Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second, l.ms) - instant.getTime()
}

/**
 * Instant of a local wall-clock time. Ambiguous times (clocks set back) take the later instant;
 * non-existent times (clocks set forward) use the offset in force before the transition, as
 * PostgreSQL `timestamp AT TIME ZONE` does.
 */
function localInstant(l: Local, timezone: string) {
  const wall = Date.UTC(l.year, l.month - 1, l.day, l.hour, l.minute, l.second, l.ms)
  const before = zoneOffset(new Date(wall - 86_400_000), timezone)
  const after = zoneOffset(new Date(wall + 86_400_000), timezone)
  const candidates = [wall - before, wall - after].filter(
    (t) => t + zoneOffset(new Date(t), timezone) === wall,
  )
  if (candidates.length) return new Date(Math.max(...candidates))
  return new Date(wall - before)
}

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/**
 * Adds a billing cycle in local calendar months, keeping the local time of day and clipping to the
 * last day of shorter months (Jan 31 + 1 month = Feb 28/29), matching the previous PostgreSQL
 * `interval '1 month'` behaviour. Month-end anchoring policy (C2) is not decided here.
 */
export function addCycle(start: Date, cycle: 'monthly' | 'annual', timezone = billingTimezone) {
  const l = localParts(start, timezone)
  const index = l.year * 12 + (l.month - 1) + (cycle === 'annual' ? 12 : 1)
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return localInstant({ ...l, year, month, day: Math.min(l.day, daysIn(year, month)) }, timezone)
}

/** Local calendar month containing `now`: [first day 00:00, next first day 00:00). */
export function billingMonth(now: Date, timezone = billingTimezone) {
  const l = localParts(now, timezone)
  const next =
    l.month === 12 ? { year: l.year + 1, month: 1 } : { year: l.year, month: l.month + 1 }
  const midnight = { day: 1, hour: 0, minute: 0, second: 0, ms: 0 }
  return {
    start: localInstant({ ...midnight, year: l.year, month: l.month }, timezone),
    end: localInstant({ ...midnight, ...next }, timezone),
  }
}

/**
 * Local calendar month (YYYY-MM) of an instant: the stable identity of a monthly email allowance.
 * Unlike the month's start instant, it does not change when zone data is updated.
 */
export function billingMonthKey(now: Date, timezone = billingTimezone) {
  const l = localParts(now, timezone)
  return `${l.year}-${String(l.month).padStart(2, '0')}`
}

/** Calendar day (YYYY-MM-DD) of an instant in the billing zone. */
export const billingDay = (instant: Date, timezone = billingTimezone) =>
  companyDate(instant, timezone)

/**
 * First instant of a calendar day (YYYY-MM-DD) in `timezone`, DST-safe: if a transition skips local
 * midnight, the day starts at its first existing instant. Malformed or impossible days are 400.
 */
export function zonedDayStart(day: string, timezone = billingTimezone): Date {
  const utcMidnight = Date.parse(`${day}T00:00:00Z`)
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(utcMidnight) ||
    new Date(utcMidnight).toISOString().slice(0, 10) !== day
  )
    throw new AppError(400, 'VALIDATION_ERROR', 'Enter a valid calendar date.', {
      day: ['Enter a valid calendar date.'],
    })
  let instant = utcMidnight - zoneOffset(new Date(utcMidnight), timezone)
  instant = utcMidnight - zoneOffset(new Date(instant), timezone)
  while (companyDate(new Date(instant - 1), timezone) === day) instant -= 15 * 60_000
  while (companyDate(new Date(instant), timezone) < day) instant += 15 * 60_000
  return new Date(instant)
}
