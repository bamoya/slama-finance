import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
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
