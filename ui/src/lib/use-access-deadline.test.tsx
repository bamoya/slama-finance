import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import {
  deadlineDelay,
  maxDeadlineDelayMs,
  maxRecheckDelayMs,
  minDeadlineDelayMs,
  minRecheckDelayMs,
  useAccessDeadline,
} from './use-access-deadline'

const start = new Date('2026-11-10T10:00:00Z')
const at = (ms: number) => new Date(start.getTime() + ms).toISOString()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(start)
})
afterEach(() => vi.useRealTimers())

type Props = { deadline: string | null; scope?: string; updatedAt?: number }
function setup(initial: Props) {
  const onDeadline = vi.fn()
  const hook = renderHook(
    ({ deadline, scope = 'owner-a', updatedAt = 1 }: Props) =>
      useAccessDeadline({ deadline, scope, updatedAt, onDeadline }),
    { initialProps: initial },
  )
  return { onDeadline, ...hook }
}

it('clamps the delay between one second and twenty-four hours', () => {
  expect(deadlineDelay(at(-60_000), start.getTime())).toBe(minDeadlineDelayMs)
  expect(deadlineDelay(at(0), start.getTime())).toBe(minDeadlineDelayMs)
  expect(deadlineDelay(at(5_000), start.getTime())).toBe(5_000)
  expect(deadlineDelay(at(30 * 86_400_000), start.getTime())).toBe(maxDeadlineDelayMs)
})

it('refetches exactly at the announced boundary and not before', () => {
  const { onDeadline } = setup({ deadline: at(60_000) })
  act(() => vi.advanceTimersByTime(59_999))
  expect(onDeadline).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(onDeadline).toHaveBeenCalledTimes(1)
})

it('never spins on a deadline already in the past', () => {
  const { onDeadline } = setup({ deadline: at(-5_000) })
  act(() => vi.advanceTimersByTime(999))
  expect(onDeadline).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(onDeadline).toHaveBeenCalledTimes(1)
})

it('wakes at most every twenty-four hours for a far deadline', () => {
  const { onDeadline } = setup({ deadline: at(90 * 86_400_000) })
  act(() => vi.advanceTimersByTime(maxDeadlineDelayMs - 1))
  expect(onDeadline).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(onDeadline).toHaveBeenCalledTimes(1)
})

it('reschedules when a new response changes the deadline', () => {
  const { onDeadline, rerender } = setup({ deadline: at(10_000) })
  act(() => vi.advanceTimersByTime(4_000))
  rerender({ deadline: at(60_000), updatedAt: 2 })
  act(() => vi.advanceTimersByTime(10_000))
  expect(onDeadline).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(50_000))
  expect(onDeadline).toHaveBeenCalledTimes(1)
})

it('cancels the pending timer when the account changes or the deadline disappears', () => {
  const { onDeadline, rerender } = setup({ deadline: at(10_000) })
  rerender({ deadline: null, scope: 'owner-b', updatedAt: 2 })
  act(() => vi.advanceTimersByTime(120_000))
  expect(onDeadline).not.toHaveBeenCalled()
})

it('restarts the timer for the other tenant instead of keeping the previous one', () => {
  const { onDeadline, rerender } = setup({ deadline: at(10_000) })
  act(() => vi.advanceTimersByTime(9_000))
  rerender({ deadline: at(30_000), scope: 'owner-b' })
  act(() => vi.advanceTimersByTime(11_000))
  expect(onDeadline).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(10_000))
  expect(onDeadline).toHaveBeenCalledTimes(1)
})

it('cleans its timer and listeners on unmount', () => {
  const { onDeadline, unmount } = setup({ deadline: at(10_000) })
  unmount()
  act(() => {
    vi.advanceTimersByTime(60_000)
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('focus'))
  })
  expect(onDeadline).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('refetches on resume when the deadline passed while the page was in the background', () => {
  const { onDeadline } = setup({ deadline: at(10_000) })
  // The browser froze timers: the clock moved without the timeout firing.
  vi.setSystemTime(new Date(start.getTime() + 30_000))
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(onDeadline).toHaveBeenCalledTimes(1)
})

it('reschedules on resume when the deadline is still ahead', () => {
  const { onDeadline } = setup({ deadline: at(20_000) })
  vi.setSystemTime(new Date(start.getTime() + 5_000))
  act(() => {
    window.dispatchEvent(new Event('focus'))
  })
  expect(onDeadline).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(15_000))
  expect(onDeadline).toHaveBeenCalledTimes(1)
})

// A failed refresh brings no new response: updatedAt and the deadline stay the same.
function failing(initial: Props) {
  let reject: (() => void) | undefined
  const onDeadline = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = () => fail(new Error('offline'))
      }),
  )
  const hook = renderHook(
    ({ deadline, scope = 'owner-a', updatedAt = 1 }: Props) =>
      useAccessDeadline({ deadline, scope, updatedAt, onDeadline }),
    { initialProps: initial },
  )
  const fail = async () => {
    await act(async () => {
      reject?.()
      await Promise.resolve()
    })
  }
  return { onDeadline, fail, ...hook }
}

it('rechecks a passed boundary with bounded backoff after a failed refresh, never spinning', async () => {
  const { onDeadline, fail } = failing({ deadline: at(1_000) })
  act(() => vi.advanceTimersByTime(1_000))
  expect(onDeadline).toHaveBeenCalledTimes(1)
  // No duplicate request while one is in flight, even on focus.
  act(() => window.dispatchEvent(new Event('focus')))
  act(() => vi.advanceTimersByTime(60_000))
  expect(onDeadline).toHaveBeenCalledTimes(1)
  await fail()
  const delays: number[] = []
  for (let i = 0; i < 8; i++) {
    const before = Date.now()
    await act(async () => {
      await vi.advanceTimersToNextTimerAsync()
    })
    delays.push(Date.now() - before)
    expect(onDeadline).toHaveBeenCalledTimes(i + 2)
    await fail()
  }
  expect(delays.slice(0, 4)).toEqual([
    minRecheckDelayMs,
    2 * minRecheckDelayMs,
    4 * minRecheckDelayMs,
    8 * minRecheckDelayMs,
  ])
  expect(Math.min(...delays)).toBeGreaterThanOrEqual(minRecheckDelayMs)
  expect(Math.max(...delays)).toBe(maxRecheckDelayMs)
  expect(vi.getTimerCount()).toBe(1)
})

it('rearms for the real boundary when the early 24-hour refresh fails', async () => {
  const { onDeadline, fail } = failing({ deadline: at(maxDeadlineDelayMs + 3_600_000) })
  act(() => vi.advanceTimersByTime(maxDeadlineDelayMs))
  expect(onDeadline).toHaveBeenCalledTimes(1)
  await fail()
  act(() => vi.advanceTimersByTime(3_600_000 - 1))
  expect(onDeadline).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(1))
  expect(onDeadline).toHaveBeenCalledTimes(2)
})

it('stops rechecking once a new response arrives, and on unmount during a refresh', async () => {
  const { onDeadline, fail, rerender, unmount } = failing({ deadline: at(1_000) })
  act(() => vi.advanceTimersByTime(1_000))
  rerender({ deadline: at(600_000), updatedAt: 2 })
  await fail()
  act(() => vi.advanceTimersByTime(599_000 - 1))
  expect(onDeadline).toHaveBeenCalledTimes(1)
  act(() => vi.advanceTimersByTime(1))
  expect(onDeadline).toHaveBeenCalledTimes(2)
  unmount()
  await fail()
  expect(vi.getTimerCount()).toBe(0)
})

it('rechecks when the callback throws synchronously', async () => {
  const onDeadline = vi.fn(() => {
    throw new Error('boom')
  })
  renderHook(() => useAccessDeadline({ deadline: at(1_000), scope: 'a', updatedAt: 1, onDeadline }))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1_000)
  })
  expect(onDeadline).toHaveBeenCalledTimes(1)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(minRecheckDelayMs)
  })
  expect(onDeadline).toHaveBeenCalledTimes(2)
})
