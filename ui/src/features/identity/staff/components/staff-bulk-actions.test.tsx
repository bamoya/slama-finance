import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  it('blocks the whole deletion selection when the server rejects self instead of silently skipping it', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('You cannot delete your own account.'))
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
      >
        <StaffBulkActions
          clear={vi.fn()}
          selected={[
            { ...person, archivedAt: '2026-10-02T10:00:00Z' },
            { ...person, id: 'self' },
          ]}
        />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Review impact again' })).toBeEnabled(),
    )
    expect(screen.getByRole('button', { name: 'Delete permanently' })).toBeDisabled()
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/v1/staff/deletion/preview',
        method: 'POST',
        data: { ids: ['other', 'self'] },
      }),
      undefined,
    )
    expect(apiRequest).toHaveBeenCalledTimes(1)
  })
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
