import { type SQL, sql } from 'drizzle-orm'

/**
 * An instant for queue leases, availability and completion stamps. `at` is an optional test
 * injection; production leaves it undefined so the database clock decides inside the statement
 * (the clock that also stamps `available_at` on enqueue). Host/database skew then can never make a
 * job unclaimable or a lease look expired. `plusMs` offsets it (lease length, retry backoff).
 *
 * The database instant is `statement_timestamp()`: current for every statement even inside a long
 * caller transaction (a lease that expired while that transaction ran fails its fence), yet one
 * instant within a statement, so a lease set with its start is exactly `start + lease`. `now()`
 * (the transaction start) is used only where one instant per transaction is intended.
 */
export type QueueTime = { readonly queueTime: true; at?: Date; plusMs: number }

export function queueTime(at?: Date, plusMs = 0): QueueTime {
  // A NaN/Infinity offset is a programming error: fail loudly instead of dropping the backoff.
  if (!Number.isFinite(plusMs))
    throw new RangeError(`Queue time offset must be a finite number of milliseconds: ${plusMs}`)
  if (at && Number.isNaN(at.getTime())) throw new RangeError('Queue time instant is invalid')
  return { queueTime: true, at, plusMs }
}

const isQueueTime = (value: unknown): value is QueueTime =>
  typeof value === 'object' && value !== null && 'queueTime' in value

/** Repositories only: the SQL expression of a queue instant. */
export function queueSql(
  value: QueueTime | Date | undefined,
  clock: 'statement' | 'transaction' = 'statement',
): SQL {
  const time = isQueueTime(value) ? value : queueTime(value)
  const base = time.at
    ? sql`${time.at.toISOString()}::timestamptz`
    : clock === 'transaction'
      ? sql`now()`
      : sql`statement_timestamp()`
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
