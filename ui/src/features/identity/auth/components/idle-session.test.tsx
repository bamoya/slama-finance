import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { recordActivity } from '../api/auth-client'
import { IdleSession } from './idle-session'

const state = vi.hoisted(() => ({ deadline: '', logout: vi.fn() }))
vi.mock('../api/auth-client', () => ({ recordActivity: vi.fn() }))
vi.mock('../hooks/use-session', () => ({
  useSession: () => ({
    data: { purpose: 'full', user: { id: 'staff' }, idleExpiresAt: state.deadline },
  }),
}))
vi.mock('../hooks/use-logout', () => ({
  useLogout: () => ({ mutate: state.logout, isPending: false, error: null }),
}))
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-05T12:00:00Z'))
  vi.mocked(recordActivity).mockReset()
  state.deadline = new Date(Date.now() + 60_000).toISOString()
})
afterEach(() => vi.useRealTimers())
describe('inactivity warning', () => {
  it('shows the final minute without renewing, then renews through Stay signed in', async () => {
    vi.mocked(recordActivity).mockResolvedValue({
      purpose: 'full',
      permissionKeys: [],
      user: {
        id: 'staff',
        email: 'staff@example.test',
        firstName: null,
        lastName: null,
        avatarUrl: null,
      },
      idleExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    })
    render(<IdleSession />)
    expect(screen.getByRole('dialog')).toHaveTextContent('60 seconds')
    expect(recordActivity).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' })))
    expect(recordActivity).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('reports renewal failure and still expires at the confirmed deadline', async () => {
    vi.mocked(recordActivity).mockRejectedValue(new Error('offline'))
    const expired = vi.fn()
    window.addEventListener('slama:session-expired', expired)
    try {
      render(<IdleSession />)
      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Stay signed in' })))
      expect(screen.getByRole('alert')).toHaveTextContent('Unable to extend your session')
      await act(async () => vi.advanceTimersByTimeAsync(60_000))
      expect(expired).toHaveBeenCalledOnce()
      expect(expired.mock.calls[0]![0].detail).toEqual({ reason: 'inactivity' })
    } finally {
      window.removeEventListener('slama:session-expired', expired)
    }
  })
})
