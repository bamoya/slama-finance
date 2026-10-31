import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  mockApi,
  payment,
  renderAt,
  useAdminTestLifecycle,
} from '../administration/shared/api-mock'
import { PaymentHistory } from './components/payment-history'

useAdminTestLifecycle()

describe('owner payment history', () => {
  it('shows the rejection reason for rejected payments', async () => {
    const owned = (over: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(payment(over)).filter(
          ([key]) => !['ownerId', 'ownerEmail', 'decidedBy', 'receivedReference'].includes(key),
        ),
      )
    mockApi(() => ({
      body: {
        data: [
          owned({
            status: 'rejected',
            rejectionReason: 'Transfer not received',
            decidedAt: '2026-10-02T10:00:00Z',
          }),
          owned({ id: '44444444-4444-4444-8444-444444444444', reference: 'REF-2' }),
        ],
      },
    }))
    renderAt('/owner/subscription', <PaymentHistory />)
    expect(await screen.findByText(/Transfer not received/)).toBeInTheDocument()
    expect(screen.getAllByText(/Reason:/)).toHaveLength(1)
  })
})
