/** Display calendar dates without timezone conversion of date-only values. */
export function displayDate(value: string | null | undefined) {
  if (!value) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T|$)/.exec(value)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value
}

export function displayDateTime(value: string | null | undefined, timezone = 'Africa/Casablanca') {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value
  return `${get('day')}-${get('month')}-${get('year')} ${get('hour')}:${get('minute')}`
}

/** Rolling calendar months, clamped to the last valid day of the target month. */
export function rollingDateRange(months: number, timezone = 'Africa/Casablanca', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const year = get('year'),
    month = get('month'),
    day = get('day')
  const end = new Date(year, month - 1, day, 12)
  const start = new Date(year, month - 1 - months, 1, 12)
  start.setDate(Math.min(day, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()))
  const format = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return { from: format(start), to: format(end) }
}
