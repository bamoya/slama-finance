import { useEffect, useRef } from 'react'

export const minDeadlineDelayMs = 1_000
export const maxDeadlineDelayMs = 24 * 60 * 60 * 1_000
export const minRecheckDelayMs = 5_000
export const maxRecheckDelayMs = 5 * 60 * 1_000

/** Delay until the server-announced boundary, clamped so a past or far deadline never spins or overflows. */
export function deadlineDelay(deadline: string, now = Date.now()) {
  const until = Date.parse(deadline) - now
  return Math.min(maxDeadlineDelayMs, Math.max(minDeadlineDelayMs, until))
}

/** Bounded exponential backoff before reading a passed boundary again after a refresh left it unchanged. */
export function recheckDelay(attempt: number) {
  return Math.min(maxRecheckDelayMs, minRecheckDelayMs * 2 ** attempt)
}

/**
 * Calls `onDeadline` when `accessValidUntil` is reached, so resolved access is read again at the instant
 * the API says it may change. The server stays authoritative: the client never derives access itself.
 * The timer is rescheduled whenever a response (`updatedAt`) or the account/tenant (`scope`) changes, is
 * cancelled on unmount, and is re-evaluated when the page regains focus or leaves the background, because
 * browsers throttle timers of hidden tabs. When the refresh (awaited if it returns a promise) brings no new
 * response, for example because the request failed, the hook rearms itself: towards a boundary still ahead
 * (after an early 24-hour wake), or with bounded backoff for a passed one. One refresh runs at a time.
 */
export function useAccessDeadline({
  deadline,
  scope,
  updatedAt,
  onDeadline,
}: {
  deadline: string | null | undefined
  scope: string | null | undefined
  updatedAt: number
  onDeadline: () => unknown
}) {
  const callback = useRef(onDeadline)
  useEffect(() => {
    callback.current = onDeadline
  })
  useEffect(() => {
    if (!deadline || Number.isNaN(Date.parse(deadline))) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let active = true
    let inflight = false
    let attempt = 0
    const fire = () => {
      if (inflight) return
      clearTimeout(timer)
      inflight = true
      let refresh: unknown
      try {
        refresh = callback.current()
      } catch {
        refresh = undefined
      }
      void Promise.resolve(refresh)
        .catch(() => undefined)
        .finally(() => {
          inflight = false
          // A new response or scope reruns this effect and clears `active`; otherwise read again later.
          if (!active) return
          clearTimeout(timer)
          timer = setTimeout(
            fire,
            Date.parse(deadline) > Date.now() ? deadlineDelay(deadline) : recheckDelay(attempt++),
          )
        })
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(fire, deadlineDelay(deadline))
    }
    const resume = () => {
      if (document.visibilityState === 'hidden' || inflight) return
      if (Date.parse(deadline) <= Date.now()) {
        fire()
        return
      }
      schedule()
    }
    schedule()
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    return () => {
      active = false
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
    }
  }, [deadline, scope, updatedAt])
}
