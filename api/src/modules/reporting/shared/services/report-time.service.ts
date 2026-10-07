import { AppError } from '../../../../lib/errors.js'

export const REPORT_LIMITS = {
  periodDays: 366,
  pageSize: 25,
  maxPageSize: 100,
  pdfRows: 2000,
  csvRows: 10000,
  catchUp: 7,
  artifactBytes: 8 * 1024 * 1024,
}
const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(timezone: string) {
  let value = formatters.get(timezone)
  if (!value) {
    try {
      value = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
      value.format(new Date())
    } catch {
      throw new AppError(400, 'INVALID_TIMEZONE', 'Choose a valid IANA timezone.')
    }
    formatters.set(timezone, value)
  }
  return value
}
export function localParts(instant: Date, timezone: string) {
  const parts = Object.fromEntries(
    formatter(timezone)
      .formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  )
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}:${parts.second}`,
  }
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10)
}
/** Repeated times choose the earlier instant. Gaps advance to the next valid local minute. */
export function localInstant(date: string, time: string, timezone: string): Date {
  formatter(timezone)
  const base = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`)
  for (let minute = 0; minute <= 180; minute++) {
    const nominal = base + minute * 60000
    const desired = new Date(nominal).toISOString().slice(0, 19)
    const offsets = new Set(
      [-86400000, 0, 86400000].map((delta) => {
        const value = new Date(nominal + delta)
        const local = localParts(value, timezone)
        return Date.parse(`${local.date}T${local.time}Z`) - value.getTime()
      }),
    )
    const candidates = [...offsets]
      .map((offset) => new Date(nominal - offset))
      .filter((value) => {
        const local = localParts(value, timezone)
        return `${local.date}T${local.time}` === desired
      })
      .sort((a, b) => a.getTime() - b.getTime())
    if (candidates[0]) return candidates[0]
  }
  throw new AppError(400, 'INVALID_LOCAL_TIME', 'The selected local time is unavailable.')
}
export type Cadence = {
  frequency: string
  weekday: number | null
  monthDay: number | null
  localTime: string
  timezone: string
  period: string
}
export function nextOccurrence(config: Cadence, after: Date) {
  const first = localParts(after, config.timezone).date
  for (let index = 0; index <= 370; index++) {
    const day = addDays(first, index)
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7
    if (config.frequency === 'weekly' && weekday !== config.weekday) continue
    if (config.frequency === 'monthly' && Number(day.slice(8)) !== config.monthDay) continue
    const instant = localInstant(day, config.localTime.slice(0, 5), config.timezone)
    if (instant > after) return instant
  }
  throw new AppError(400, 'INVALID_CADENCE', 'Unable to calculate the next occurrence.')
}
export function occurrencePeriod(config: Cadence, occurrence: Date) {
  const day = localParts(occurrence, config.timezone).date
  if (config.period === 'previous_day') return { from: addDays(day, -1), to: addDays(day, -1) }
  if (config.period === 'previous_week') {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay() || 7
    const monday = addDays(day, 1 - weekday)
    return { from: addDays(monday, -7), to: addDays(monday, -1) }
  }
  const start = `${day.slice(0, 7)}-01`
  const to = addDays(start, -1)
  return { from: `${to.slice(0, 7)}-01`, to }
}
