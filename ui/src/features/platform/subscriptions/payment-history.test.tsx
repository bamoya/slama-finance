import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  mockApi,
  payment,
  renderAt,
  useAdminTestLifecycle,
} from '../administration/shared/api-mock'
import { InvoiceHistory } from './components/invoice-history'
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
          owned({
            id: '44444444-4444-4444-8444-444444444444',
            reference: 'REF-2',
            receivedTtc: 5000,
            invoiceNumber: 'F-2026-000001',
          }),
        ],
      },
    }))
    renderAt('/subscription', <PaymentHistory />)
    expect(await screen.findByText(/Transfer not received/)).toBeInTheDocument()
    expect(screen.getAllByText(/Reason:/)).toHaveLength(1)
    expect(screen.getByText('Received 50,00 DH of 120,00 DH')).toBeInTheDocument()
    expect(screen.getByText('Invoice F-2026-000001')).toBeInTheDocument()
  })

  it('shows partial receipts on payments and issued invoices with their balance', async () => {
    const invoice = {
      id: '55555555-5555-4555-8555-555555555555',
      number: 'F-2026-000001',
      kind: 'invoice',
      correctsInvoiceNumber: null,
      reason: null,
      paymentId: '33333333-3333-4333-8333-333333333333',
      totals: {
        currency: 'MAD',
        amountHt: 10000,
        taxRateBasisPoints: 2000,
        taxAmount: 2000,
        amountTtc: 12000,
      },
      lines: [],
      issuedAt: '2026-10-02T10:00:00Z',
      allocatedTtc: 5000,
      creditedTtc: 0,
      balanceTtc: 7000,
      status: 'open',
    }
    mockApi((key) =>
      key === 'GET /api/v1/owner/subscription/invoices'
        ? {
            body: {
              data: [
                invoice,
                {
                  ...invoice,
                  id: '66666666-6666-4666-8666-666666666666',
                  number: 'A-2026-000001',
                  kind: 'credit_note',
                  correctsInvoiceNumber: 'F-2026-000001',
                  reason: 'Geste commercial',
                  paymentId: null,
                  allocatedTtc: 0,
                  balanceTtc: 0,
                  status: 'settled',
                },
              ],
            },
          }
        : undefined,
    )
    renderAt('/subscription', <InvoiceHistory />)
    expect(await screen.findByText('F-2026-000001')).toBeInTheDocument()
    expect(screen.getByText('Balance due')).toBeInTheDocument()
    expect(screen.getByText('70,00 DH')).toBeInTheDocument()
    expect(screen.getByText(/Corrects F-2026-000001 · Geste commercial/)).toBeInTheDocument()
  })
})
