export const SESSION_IDLE_MS = 60 * 60 * 1000

export function sessionIdleDeadline(lastSeenAt: Date, expiresAt: Date) {
  return new Date(Math.min(lastSeenAt.getTime() + SESSION_IDLE_MS, expiresAt.getTime()))
}
