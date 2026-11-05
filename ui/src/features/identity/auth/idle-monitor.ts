const ACTIVITY_INTERVAL_MS = 30_000

/** Only explicit interaction calls activity; the periodic clock never renews a session. */
export function createIdleMonitor(options: {
  deadline: number
  refresh: () => Promise<number>
  onTick: (seconds: number) => void
  onExpired: () => void
  latestDeadline?: () => number
}) {
  let deadline = options.deadline
  let stopped = false
  let pending = false
  let lastSent = 0
  let trailing: ReturnType<typeof setTimeout> | undefined
  const update = (next: number) => {
    if (!stopped && Number.isFinite(next)) deadline = Math.max(deadline, next)
  }
  const tick = () => {
    if (stopped) return
    update(options.latestDeadline?.() ?? NaN)
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
    // An activity request made before expiry may still be returning its confirmed deadline.
    if (remaining === 0 && pending) {
      options.onTick(1)
      return
    }
    options.onTick(remaining)
    if (remaining === 0) {
      stopped = true
      options.onExpired()
    }
  }
  const activity = async (force = false) => {
    if (stopped || pending) return
    // Check before renewing: activity after laptop sleep must not revive an idle session.
    tick()
    if (stopped) return
    const wait = ACTIVITY_INTERVAL_MS - (Date.now() - lastSent)
    if (!force && wait > 0) {
      trailing ??= setTimeout(() => {
        trailing = undefined
        void activity()
      }, wait)
      return
    }
    pending = true
    lastSent = Date.now()
    try {
      const next = await options.refresh()
      update(next)
    } catch {
      // A failed request never extends the confirmed server deadline.
    } finally {
      pending = false
      tick()
    }
  }
  const timer = setInterval(tick, 1000)
  tick()
  return {
    activity,
    update,
    check: tick,
    dispose() {
      stopped = true
      clearInterval(timer)
      clearTimeout(trailing)
    },
  }
}
