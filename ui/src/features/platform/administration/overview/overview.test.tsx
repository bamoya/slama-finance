import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { mockApi, renderAt, session, useAdminTestLifecycle } from '../shared/api-mock'
import { AdminOverviewPage } from './pages/overview-page'

useAdminTestLifecycle()

describe('admin overview', () => {
  it('shows the attention cards and links pending payments to the queue', async () => {
    mockApi((key) => {
      if (key === 'GET /v1/admin/auth/me') return { body: session }
      if (key === 'GET /v1/admin/overview')
        return {
          body: {
            pendingPayments: 3,
            activeSubscriptions: 12,
            trialsEndingSoon: 2,
            inGracePeriod: 1,
            expired: 4,
          },
        }
    })
    renderAt('/admin', <AdminOverviewPage />)
    const pending = await screen.findByRole('link', { name: /Payments to verify/ })
    expect(pending).toHaveAttribute('href', '/admin/payments')
    expect(pending).toHaveTextContent('3')
    expect(screen.getByRole('link', { name: /Expired/ })).toHaveTextContent('4')
  })
})
