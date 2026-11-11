import { type SQL, sql } from 'drizzle-orm'

/**
 * An instant for queue leases, availability and completion stamps. `at` is an optional test
 * injection; production leaves it undefined so the database clock decides inside the statement
 * (the clock that also stamps `available_at` on enqueue). Host/database skew then can never make a
 * job unclaimable or a lease look expired. `plusMs` offsets it (lease length, retry backoff).
 */
export type QueueTime = { readonly queueTime: true; at?: Date; plusMs: number }

export const queueTime = (at?: Date, plusMs = 0): QueueTime => ({ queueTime: true, at, plusMs })

const isQueueTime = (value: unknown): value is QueueTime =>
  typeof value === 'object' && value !== null && 'queueTime' in value

/** Repositories only: the SQL expression of a queue instant. */
export function queueSql(value: QueueTime | Date | undefined): SQL {
  const time = isQueueTime(value) ? value : queueTime(value)
  const base = time.at ? sql`${time.at.toISOString()}::timestamptz` : sql`now()`
  return time.plusMs ? sql`(${base} + ${Math.trunc(time.plusMs)} * interval '1 millisecond')` : base
}

/** Update values where any column may also be given as a QueueTime. */
export type WithQueueTime<T> = { [K in keyof T]?: T[K] | QueueTime }

/** Repositories only: replaces every QueueTime value of an update by its SQL expression. */
export function withQueueSql<T extends Record<string, unknown>>(changes: T) {
  return Object.fromEntries(
    Object.entries(changes).map(([key, value]) => [
      key,
      isQueueTime(value) ? queueSql(value) : value,
    ]),
  ) as { [K in keyof T]: Exclude<T[K], QueueTime> | SQL }
}
