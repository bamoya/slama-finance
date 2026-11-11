import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import {
  calls,
  mockApi,
  payment,
  renderAt,
  useAdminTestLifecycle,
} from '../administration/shared/api-mock'
import { InvoiceHistory } from './components/invoice-history'
import { PaymentHistory } from './components/payment-history'

useAdminTestLifecycle()

const customerFixture = {
  type: 'individual',
  legalName: null,
  ice: null,
  address: null,
  registrationNumber: null,
  taxIdentifier: null,
}
const issuerFixture = {
  legalName: 'B-Finance SARL',
  address: '1 rue du Port',
  ice: '001234567000089',
  registrationNumber: 'RC 1',
  taxIdentifier: 'IF 1',
  taxMention: '',
  paymentTerms: '',
}

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
      customer: customerFixture,
      issuer: issuerFixture,
    }
    mockApi((key) =>
      key === 'GET /api/v1/owner/subscription/invoices'
        ? {
            body: {
              items: [
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
              page: 1,
              pageSize: 20,
              total: 2,
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

  it('pages the invoices and downloads a PDF in the interface language', async () => {
    const invoice = (number: string) => ({
      id: '55555555-5555-4555-8555-555555555555',
      number,
      kind: 'invoice',
      correctsInvoiceNumber: null,
      reason: null,
      paymentId: null,
      totals: {
        currency: 'MAD',
        amountHt: 10000,
        taxRateBasisPoints: 2000,
        taxAmount: 2000,
        amountTtc: 12000,
      },
      lines: [],
      issuedAt: '2026-10-02T10:00:00Z',
      allocatedTtc: 12000,
      creditedTtc: 0,
      balanceTtc: 0,
      status: 'settled',
      customer: customerFixture,
      issuer: issuerFixture,
    })
    mockApi((key, _data) => {
      if (key === 'GET /api/v1/owner/subscription/invoices') {
        const page = (calls.at(-1)?.params as { page?: number } | undefined)?.page ?? 1
        return {
          body: {
            items: [invoice(page === 1 ? 'F-2026-000001' : 'F-2026-000021')],
            page,
            pageSize: 20,
            total: 21,
          },
        }
      }
      return { body: {} }
    })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    URL.createObjectURL = vi.fn(() => 'blob:pdf')
    URL.revokeObjectURL = vi.fn()
    renderAt('/subscription', <InvoiceHistory />)
    expect(await screen.findByText('F-2026-000001')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByText('F-2026-000021')).toBeInTheDocument()
    expect(
      calls.filter((c) => c.url === '/api/v1/owner/subscription/invoices').at(-1)?.params,
    ).toEqual({ page: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF F-2026-000021' }))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(calls.at(-1)).toMatchObject({
      url: '/api/v1/owner/subscription/invoices/55555555-5555-4555-8555-555555555555/pdf',
      params: { language: 'en' },
    })
  })
})
