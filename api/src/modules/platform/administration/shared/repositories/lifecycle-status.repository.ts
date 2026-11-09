import type { SQL } from 'drizzle-orm'

/**
 * Set-based lifecycle status (owner_id, trial_ends_at, status) at `at`, supplied by the
 * subscriptions module for its selected coverage read authority.
 */
export type LifecycleStatusSource = (at: SQL) => SQL
