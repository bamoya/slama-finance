import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { calls, mockApi, renderAt, session, useAdminTestLifecycle } from '../shared/api-mock'
import { AdminCustomersPage } from './pages/customers-page'

useAdminTestLifecycle()

describe('admin customers', () => {
  it('lists customers with a link to the customer page and a subscription badge', async () => {
    mockApi((key) => {
      if (key === 'GET /api/v1/admin/auth/me') return { body: session }
      if (key === 'GET /api/v1/admin/owners')
        return {
          body: {
            items: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                email: 'owner@example.test',
                firstName: 'Amel',
                lastName: 'Ben Salah',
                createdAt: '2026-09-01T09:00:00Z',
                disabledAt: null,
                subscriptionStatus: 'active',
                planCode: 'essential',
                paidThroughAt: '2026-11-01T09:00:00Z',
                organizationCount: 2,
                blockedAt: null,
                deletionDueAt: null,
                invitationPending: false,
              },
              {
                id: '22222222-2222-4222-8222-222222222223',
                email: 'legacy@example.test',
                firstName: null,
                lastName: null,
                createdAt: '2026-09-01T09:00:00Z',
                disabledAt: null,
                subscriptionStatus: 'active',
                planCode: 'essential',
                paidThroughAt: '2026-11-01T09:00:00Z',
                organizationCount: 2,
                blockedAt: null,
                deletionDueAt: null,
                invitationPending: false,
              },
            ],
            page: 1,
            pageSize: 20,
            total: 2,
          },
        }
    })
    renderAt('/customers', <AdminCustomersPage />)
    const link = await screen.findByRole('link', { name: 'Amel Ben Salah' })
    expect(link).toHaveAttribute('href', '/customers/22222222-2222-4222-8222-222222222222')
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    // Legacy accounts without names fall back to the email as the only line.
    expect(screen.getByRole('link', { name: 'legacy@example.test' })).toBeInTheDocument()
    expect(screen.getAllByText('legacy@example.test')).toHaveLength(1)
  })

  it('reads status, search and page from the address and sends them to the API', async () => {
    mockApi((key) => {
      if (key === 'GET /api/v1/admin/auth/me') return { body: session }
      if (key === 'GET /api/v1/admin/owners')
        return { body: { items: [], page: 2, pageSize: 20, total: 25 } }
    })
    renderAt('/customers?status=suspended&search=sara&page=2', <AdminCustomersPage />)
    await screen.findByText('No customers found.')
    const params = (
      calls.filter((c) => c.url === '/api/v1/admin/owners').at(-1) as { params?: unknown }
    ).params
    expect(params).toEqual({ search: 'sara', status: 'suspended', page: 2 })
  })

  it('filters customers whose trial has not started', async () => {
    mockApi((key) => {
      if (key === 'GET /api/v1/admin/auth/me') return { body: session }
      if (key === 'GET /api/v1/admin/owners')
        return { body: { items: [], page: 1, pageSize: 20, total: 0 } }
    })
    renderAt('/customers?status=not_started', <AdminCustomersPage />)
    await screen.findByText('No customers found.')
    const params = (
      calls.filter((c) => c.url === '/api/v1/admin/owners').at(-1) as { params?: unknown }
    ).params
    expect(params).toEqual({ status: 'not_started', page: 1 })
    expect(screen.getByRole('combobox', { name: 'Customer status' })).toHaveTextContent(
      'Trial not started',
    )
  })

  it('resets the filters and stores the status in the address', async () => {
    mockApi((key) => {
      if (key === 'GET /api/v1/admin/auth/me') return { body: session }
      if (key === 'GET /api/v1/admin/owners')
        return { body: { items: [], page: 1, pageSize: 20, total: 0 } }
    })
    renderAt('/customers?status=expired', <AdminCustomersPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent(/^\/customers$/))
    expect(
      within(screen.getByRole('region', { name: 'Customers' })).queryByRole('button', {
        name: 'Clear filters',
      }),
    ).toBeNull()
  })
})
