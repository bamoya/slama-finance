import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { mockApi, renderAt, session, useAdminTestLifecycle } from '../shared/api-mock'
import { AdminAuditLogPage } from './pages/audit-log-page'

useAdminTestLifecycle()

describe('admin audit log', () => {
  it('opens the before and after snapshots of an entry', async () => {
    mockApi((key) => {
      if (key === 'GET /v1/admin/auth/me') return { body: session }
      if (key === 'GET /v1/admin/audit')
        return {
          body: {
            items: [
              {
                id: '55555555-5555-4555-8555-555555555555',
                createdAt: '2026-10-01T09:00:00Z',
                adminId: null,
                actor: 'root@example.test',
                action: 'billing_settings.update',
                targetType: 'billing_settings',
                targetId: null,
                before: { paymentMethods: ['cash'] },
                after: { paymentMethods: ['cash', 'cheque'] },
              },
            ],
            page: 1,
            pageSize: 20,
            total: 1,
          },
        }
    })
    renderAt('/admin/audit', <AdminAuditLogPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Show changes' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/cheque/)).toBeInTheDocument()
    expect(within(dialog).getByText('Before')).toBeInTheDocument()
  })
})
