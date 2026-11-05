import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createIdleMonitor } from './idle-monitor'

const hour = 3_600_000
const monitors: ReturnType<typeof createIdleMonitor>[] = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
})
afterEach(() => {
  monitors.splice(0).forEach((monitor) => monitor.dispose())
  vi.useRealTimers()
})
function setup(deadline = Date.now() + hour, refresh = vi.fn(async () => Date.now() + hour)) {
  const onTick = vi.fn()
  const onExpired = vi.fn()
  const monitor = createIdleMonitor({ deadline, refresh, onTick, onExpired })
  monitors.push(monitor)
  return { monitor, refresh, onTick, onExpired }
}
describe('inactivity monitoring', () => {
  it('counts down the final minute and expires once without sending background activity', async () => {
    const state = setup()
    await vi.advanceTimersByTimeAsync(hour - 60_000)
    expect(state.onTick).toHaveBeenLastCalledWith(60)
    expect(state.onExpired).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(state.onExpired).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(5000)
    expect(state.onExpired).toHaveBeenCalledOnce()
    expect(state.refresh).not.toHaveBeenCalled()
  })
  it('throttles activity and sends a trailing update for the most recent interaction', async () => {
    const state = setup()
    await state.monitor.activity()
    await vi.advanceTimersByTimeAsync(5000)
    await state.monitor.activity()
    await state.monitor.activity()
    expect(state.refresh).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(25_000)
    expect(state.refresh).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(hour - 1000)
    expect(state.onExpired).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(state.onExpired).toHaveBeenCalledOnce()
  })
  it('forces an immediate renewal when Stay signed in is clicked', async () => {
    const state = setup()
    await state.monitor.activity()
    await state.monitor.activity(true)
    expect(state.refresh).toHaveBeenCalledTimes(2)
  })
  it('expires on wake before accepting new interaction', async () => {
    const state = setup()
    vi.setSystemTime(Date.now() + hour + 1)
    await state.monitor.activity()
    expect(state.refresh).not.toHaveBeenCalled()
    expect(state.onExpired).toHaveBeenCalledOnce()
  })
  it('never extends a session after a failed activity request', async () => {
    const state = setup(Date.now() + 1000, vi.fn().mockRejectedValue(new Error('offline')))
    await state.monitor.activity(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect(state.onExpired).toHaveBeenCalledOnce()
  })
  it('uses activity confirmed in another tab before expiring a suspended tab', () => {
    const onExpired = vi.fn()
    let confirmed = NaN
    const monitor = createIdleMonitor({
      deadline: Date.now() + 1000,
      refresh: vi.fn(),
      onTick: vi.fn(),
      onExpired,
      latestDeadline: () => confirmed,
    })
    monitors.push(monitor)
    confirmed = Date.now() + hour
    vi.setSystemTime(Date.now() + 2000)
    monitor.check()
    expect(onExpired).not.toHaveBeenCalled()
  })
})
