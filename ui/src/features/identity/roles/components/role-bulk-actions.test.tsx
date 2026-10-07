import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import type { Role } from '../../../../api/generated/schemas/identity/rbac.schemas'
import { apiRequest } from '../../../../api/http'
import { RoleBulkActions } from './role-bulk-actions'

vi.mock('../../../../api/http', () => ({ apiRequest: vi.fn() }))
vi.mock('../../auth/hooks/use-authorization', () => ({
  useAuthorization: () => ({ can: (key: string) => key !== 'invoices.delete' }),
}))
it('deletes eligible roles only and explains that staff assignments are removed', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  vi.mocked(apiRequest).mockResolvedValue(undefined)
  const role: Role = {
    id: 'role',
    key: 'sales',
    name: 'Sales',
    description: null,
    isSystem: false,
    permissionKeys: ['invoices.read'],
    createdAt: '2026-10-02T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
  }
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RoleBulkActions
        clear={vi.fn()}
        selected={[
          role,
          { ...role, id: 'system', key: 'admin', isSystem: true },
          { ...role, id: 'privileged', permissionKeys: ['invoices.delete'] },
        ]}
      />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
  expect(screen.getByText(/removes these roles from all staff/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
  await screen.findByText('1 succeeded · 2 skipped · 0 failed')
  expect(apiRequest).toHaveBeenCalledTimes(1)
  expect(apiRequest).toHaveBeenCalledWith(
    expect.objectContaining({ url: '/v1/rbac/roles/role', method: 'DELETE' }),
    undefined,
  )
})
