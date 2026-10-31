import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
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
  function setup() {
    mockApi((key) => {
      if (key === 'GET /v1/admin/auth/me') return { body: session }
      if (key === 'GET /v1/admin/payments')
        return { body: { items: [payment()], page: 1, pageSize: 20, total: 1 } }
      if (key.startsWith('POST /v1/admin/payments/'))
        return { body: payment({ status: 'confirmed' }) }
    })
    renderAt('/admin/payments', <AdminPaymentsPage />)
  }
  it('lists submitted payments by default with owner email and TTC', async () => {
    setup()
    expect(await screen.findByText('owner@example.test')).toBeInTheDocument()
    expect(screen.getByText('120,00 DH')).toBeInTheDocument()
    expect(calls.find((call) => call.url === '/v1/admin/payments')).toBeTruthy()
  })

  it('confirms with an optional received reference', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Received reference (optional)'), {
      target: { value: 'BANK-9' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm payment' }))
    await waitFor(() =>
      expect(calls.find((call) => call.url?.endsWith('/confirm'))?.data).toEqual({
        receivedReference: 'BANK-9',
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('requires a reason before rejecting', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject payment' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('why the payment')
    expect(calls.some((call) => call.url?.endsWith('/reject'))).toBe(false)
    fireEvent.change(within(dialog).getByLabelText('Rejection reason'), {
      target: { value: 'Amount mismatch' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject payment' }))
    await waitFor(() =>
      expect(calls.find((call) => call.url?.endsWith('/reject'))?.data).toEqual({
        reason: 'Amount mismatch',
      }),
    )
  })
})
