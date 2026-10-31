export type Cycle = 'monthly' | 'annual'

const pad = (value: number) => String(value).padStart(2, '0')

/** Today in the administrator's calendar, as YYYY-MM-DD. */
export function todayIso(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** The day a coverage period starting on `start` ends: one month or one year later. */
export function coverageEnd(start: string, cycle: Cycle) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start)
  if (!match) return ''
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const target =
    cycle === 'annual'
      ? new Date(Date.UTC(year + 1, month - 1, 1))
      : new Date(Date.UTC(year, month, 1))
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate()
  target.setUTCDate(Math.min(day, lastDay))
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`
}

/** Coverage boundaries are whole days at midnight UTC. */
export const midnightUtc = (day: string) => `${day}T00:00:00.000Z`
