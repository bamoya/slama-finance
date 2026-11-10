import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { ApiError } from '../../../../lib/api-error'
import { WorkspaceBoundary } from './workspace-context'

const session = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock('../../../../api/generated/identity/identity', () => ({
  useGetWorkspaceSession: session.query,
}))

beforeEach(() => session.query.mockReset())

it('sends a visitor without a staff session to the login page', () => {
  session.query.mockReturnValue({
    isPending: false,
    data: undefined,
    error: new ApiError(401, 'UNAUTHENTICATED', 'Sign in to this organization.'),
  })
  const { hook, history } = memoryLocation({ path: '/workspace/dashboard', record: true })
  render(
    <Router hook={hook}>
      <WorkspaceBoundary>
        <p>workspace</p>
      </WorkspaceBoundary>
    </Router>,
  )
  expect(screen.queryByText('workspace')).toBeNull()
  expect(screen.queryByText('Organization unavailable')).toBeNull()
  expect(history?.at(-1)).toBe('/login')
})

const workspace = (organizationId: string, accessValidUntil: string | null) => ({
  organization: { id: organizationId },
  subscription: { accessValidUntil },
})

describe('entitlement deadline', () => {
  const refetch = vi.fn()
  const mountWith = (data: unknown, dataUpdatedAt = 1) => {
    session.query.mockReturnValue({ isPending: false, error: null, data, dataUpdatedAt, refetch })
    return (
      <Router hook={memoryLocation({ path: '/workspace/dashboard' }).hook}>
        <WorkspaceBoundary>
          <p>workspace</p>
        </WorkspaceBoundary>
      </Router>
    )
  }
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T10:00:00Z'))
    refetch.mockReset()
  })
  afterEach(() => vi.useRealTimers())

  it('reads the session again when resolved access may change, and follows a new deadline', () => {
    const { rerender } = render(mountWith(workspace('org-a', '2026-11-10T10:00:30Z')))
    act(() => vi.advanceTimersByTime(29_999))
    expect(refetch).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(1))
    expect(refetch).toHaveBeenCalledTimes(1)
    // The response announces a later boundary: the previous timer is replaced.
    rerender(mountWith(workspace('org-a', '2026-11-10T11:00:00Z'), 2))
    act(() => vi.advanceTimersByTime(60_000))
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('does not keep a timer for a tenant that was replaced', () => {
    const { rerender } = render(mountWith(workspace('org-a', '2026-11-10T10:00:30Z')))
    rerender(mountWith(workspace('org-b', null), 2))
    act(() => vi.advanceTimersByTime(120_000))
    expect(refetch).not.toHaveBeenCalled()
  })
})
