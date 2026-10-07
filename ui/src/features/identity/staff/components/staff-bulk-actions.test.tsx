import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiRequest } from '../../../../api/http'
import { StaffBulkActions } from './staff-bulk-actions'

vi.mock('../../../../api/http', () => ({ apiRequest: vi.fn() }))
vi.mock('../../auth/hooks/use-authorization', () => ({
  useAuthorization: () => ({ can: () => true }),
}))
vi.mock('../../auth/hooks/use-session', () => ({
  useSession: () => ({ data: { user: { id: 'self' } } }),
}))
const person = {
  id: 'other',
  email: 'staff@example.com',
  firstName: 'Staff',
  lastName: 'Member',
  disabledAt: null,
  archivedAt: null,
}
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  vi.mocked(apiRequest).mockReset().mockResolvedValue({})
})
describe('Staff bulk access changes', () => {
  it('excludes self and archived accounts from disable requests', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <StaffBulkActions
          clear={vi.fn()}
          selected={[
            person,
            { ...person, id: 'self' },
            { ...person, id: 'archived', archivedAt: '2026-10-02T10:00:00Z' },
          ]}
        />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByText('1 succeeded · 2 skipped · 0 failed')
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/v1/staff/other/disable' }),
      undefined,
    )
  })
})
