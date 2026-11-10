import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  apiError,
  calls,
  mockApi,
  payment,
  renderAt,
  session,
  useAdminTestLifecycle,
} from '../shared/api-mock'
import { AdminPaymentsPage } from './pages/payments-page'

useAdminTestLifecycle()

describe('admin payments', () => {
  function setup(fail = false) {
    mockApi((key) => {
      if (key === 'GET /api/v1/admin/auth/me') return { body: session }
      if (key === 'GET /api/v1/admin/payments')
        return { body: { items: [payment()], page: 1, pageSize: 20, total: 1 } }
      if (key.startsWith('POST /api/v1/admin/payments/'))
        return fail
          ? apiError(403, 'TWO_FACTOR_INVALID')
          : { body: payment({ status: 'confirmed' }) }
    })
    renderAt('/payments', <AdminPaymentsPage />)
  }
  it('lists submitted payments by default with owner email and TTC', async () => {
    setup()
    expect(await screen.findByText('owner@example.test')).toBeInTheDocument()
    expect(screen.getByText('120,00 DH')).toBeInTheDocument()
    expect(calls.find((call) => call.url === '/api/v1/admin/payments')).toBeTruthy()
  })

  it('confirms with an optional received reference', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Received reference (optional)'), {
      target: { value: 'BANK-9' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm payment' }))
    expect(calls.some((call) => call.url?.endsWith('/confirm'))).toBe(false)
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), {
      target: { value: 'Bank verified' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm payment' }))
    await waitFor(() =>
      expect(calls.find((call) => call.url?.endsWith('/confirm'))?.data).toEqual({
        receivedReference: 'BANK-9',
        auditReason: 'Bank verified',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('requires a reason before rejecting', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject payment' }))
    expect(
      await within(dialog).findByText('Indicate why the payment is rejected.'),
    ).toBeInTheDocument()
    expect(calls.some((call) => call.url?.endsWith('/reject'))).toBe(false)
    fireEvent.change(within(dialog).getByLabelText('Rejection reason'), {
      target: { value: 'Amount mismatch' },
    })
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), {
      target: { value: 'Verified with bank' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject payment' }))
    await waitFor(() =>
      expect(calls.find((call) => call.url?.endsWith('/reject'))?.data).toEqual({
        reason: 'Amount mismatch',
        auditReason: 'Verified with bank',
      }),
    )
  })

  it('keeps the dialog and reason open after a refused decision, without any code field', async () => {
    setup(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Authenticator code')).toBeNull()
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), {
      target: { value: 'Verified' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm payment' }))
    await within(dialog).findByText('server TWO_FACTOR_INVALID')
    expect(within(dialog).getByLabelText('Reason (internal)')).toHaveValue('Verified')
    expect(calls.find((call) => call.url?.endsWith('/confirm'))?.data).not.toHaveProperty('code')
  })

  it('records a partial receipt with its amount and date, within the remaining balance', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), {
      target: { value: 'First transfer' },
    })
    fireEvent.change(within(dialog).getByLabelText('Amount received (optional)'), {
      target: { value: '120,01' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm payment' }))
    expect(calls.some((call) => call.url?.endsWith('/confirm'))).toBe(false)
    fireEvent.change(within(dialog).getByLabelText('Amount received (optional)'), {
      target: { value: '50,5' },
    })
    fireEvent.change(within(dialog).getByLabelText('Received reference (optional)'), {
      target: { value: 'VIR-1' },
    })
    fireEvent.change(within(dialog).getByLabelText('Received on (optional)'), {
      target: { value: '2026-10-02T10:00' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm payment' }))
    await waitFor(() =>
      expect(calls.find((call) => call.url?.endsWith('/confirm'))?.data).toEqual({
        auditReason: 'First transfer',
        receivedReference: 'VIR-1',
        receivedAmountTtc: 5050,
        receivedAt: new Date('2026-10-02T10:00').toISOString(),
      }),
    )
  })

  it('warns that rejecting a partially paid payment credits the invoice', async () => {
    mockApi((key) => {
      if (key === 'GET /api/v1/admin/auth/me') return { body: session }
      if (key === 'GET /api/v1/admin/payments')
        return {
          body: { items: [payment({ receivedTtc: 5000 })], page: 1, pageSize: 20, total: 1 },
        }
    })
    renderAt('/payments', <AdminPaymentsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('note')).toHaveTextContent(
      '50,00 DH were already received. Rejecting issues a credit note for the whole invoice',
    )
  })

  it('takes the status filter from the address', async () => {
    mockApi((key) => {
      if (key === 'GET /api/v1/admin/auth/me') return { body: session }
      if (key === 'GET /api/v1/admin/payments')
        return { body: { items: [], page: 1, pageSize: 20, total: 0 } }
    })
    renderAt('/payments?status=rejected', <AdminPaymentsPage />)
    await screen.findByText('No payments for this status.')
    const last = calls.filter((c) => c.url === '/api/v1/admin/payments').at(-1)
    expect(last?.params).toEqual({ status: 'rejected', page: 1 })
  })
})
