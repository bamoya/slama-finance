import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AdminPaymentsPage } from '../payments/pages/payments-page'
import { apiError, mockApi, renderAt, session, useAdminTestLifecycle } from './api-mock'

useAdminTestLifecycle()

describe('admin session guard', () => {
  it('redirects to the admin login on a 401 session', async () => {
    mockApi((key) => (key === 'GET /v1/admin/auth/me' ? apiError(401, 'UNAUTHENTICATED') : {}))
    renderAt('/admin/payments', <AdminPaymentsPage />)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/login'))
  })

  it('signs out when a data request returns 401', async () => {
    mockApi((key) => {
      if (key === 'GET /v1/admin/auth/me') return { body: session }
      if (key === 'GET /v1/admin/payments') return apiError(401, 'UNAUTHENTICATED')
    })
    renderAt('/admin/payments', <AdminPaymentsPage />)
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/login'))
  })

  it('has admin navigation only', async () => {
    mockApi((key) => {
      if (key === 'GET /v1/admin/auth/me') return { body: session }
      if (key === 'GET /v1/admin/payments')
        return { body: { items: [], page: 1, pageSize: 20, total: 0 } }
    })
    renderAt('/admin/payments', <AdminPaymentsPage />)
    const nav = await screen.findByRole('navigation', { name: 'Administration navigation' })
    const hrefs = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'))
    expect(hrefs).toEqual([
      '/admin/payments',
      '/admin/customers',
      '/admin/billing-settings',
      '/admin/audit',
    ])
  })
})
