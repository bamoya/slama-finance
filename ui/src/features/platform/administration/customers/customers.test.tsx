import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { mockApi, renderAt, session, useAdminTestLifecycle } from '../shared/api-mock'
import { AdminCustomersPage } from './pages/customers-page'

useAdminTestLifecycle()

describe('admin customers', () => {
  it('lists customers with a link to the customer page and a subscription badge', async () => {
    mockApi((key) => {
      if (key === 'GET /v1/admin/auth/me') return { body: session }
      if (key === 'GET /v1/admin/owners')
        return {
          body: {
            items: [
              {
                id: '22222222-2222-4222-8222-222222222222',
                email: 'owner@example.test',
                name: 'Owner One',
                createdAt: '2026-09-01T09:00:00Z',
                disabledAt: null,
                subscriptionStatus: 'active',
                planCode: 'essential',
                paidThroughAt: '2026-11-01T09:00:00Z',
                organizationCount: 2,
              },
            ],
            page: 1,
            pageSize: 20,
            total: 1,
          },
        }
    })
    renderAt('/admin/customers', <AdminCustomersPage />)
    const link = await screen.findByRole('link', { name: 'owner@example.test' })
    expect(link).toHaveAttribute('href', '/admin/customers/22222222-2222-4222-8222-222222222222')
    expect(screen.getByText('Owner One')).toBeInTheDocument()
  })
})
