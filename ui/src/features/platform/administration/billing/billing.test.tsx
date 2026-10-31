import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { calls, mockApi, renderAt, session, useAdminTestLifecycle } from '../shared/api-mock'
import {
  basisPointsToPercent,
  parseMethods,
  percentToBasisPoints,
  validateBilling,
} from './billing-settings'
import { AdminBillingSettingsPage } from './pages/billing-settings-page'

useAdminTestLifecycle()

describe('billing settings', () => {
  it('converts percent to basis points and back', () => {
    expect(percentToBasisPoints('20')).toBe(2000)
    expect(percentToBasisPoints('8,5')).toBe(850)
    expect(percentToBasisPoints('0')).toBe(0)
    expect(percentToBasisPoints('100')).toBe(10000)
    expect(percentToBasisPoints('100,01')).toBeNull()
    expect(percentToBasisPoints('abc')).toBeNull()
    expect(basisPointsToPercent(2000)).toBe('20')
    expect(basisPointsToPercent(850)).toBe('8,5')
    expect(parseMethods('bank_transfer, cash\ncheque')).toEqual(['bank_transfer', 'cash', 'cheque'])
  })

  it('validates methods, rate and instructions', () => {
    const base = {
      vatApplicable: true,
      vatPercent: '20',
      paymentMethods: 'cash',
      paymentInstructions: '',
    }
    expect(validateBilling(base).payload).toEqual({
      taxRateBasisPoints: 2000,
      paymentMethods: ['cash'],
      paymentInstructions: '',
    })
    expect(
      validateBilling({ ...base, vatApplicable: false }).payload?.taxRateBasisPoints,
    ).toBeNull()
    expect(validateBilling({ ...base, vatPercent: '101' }).errors?.vatPercent).toBeTruthy()
    expect(validateBilling({ ...base, paymentMethods: '' }).errors?.paymentMethods).toBeTruthy()
    expect(validateBilling({ ...base, paymentMethods: 'Cash' }).errors?.paymentMethods).toBeTruthy()
    expect(validateBilling({ ...base, paymentMethods: 'a,a' }).errors?.paymentMethods).toBeTruthy()
    expect(
      validateBilling({
        ...base,
        paymentMethods: Array.from({ length: 11 }, (_, i) => `m${i}`).join(','),
      }).errors?.paymentMethods,
    ).toBeTruthy()
    expect(
      validateBilling({ ...base, paymentInstructions: 'x'.repeat(2001) }).errors
        ?.paymentInstructions,
    ).toBeTruthy()
  })

  function setup() {
    const settings = {
      currency: 'MAD',
      taxRateBasisPoints: null,
      paymentMethods: ['bank_transfer'],
      paymentInstructions: 'RIB 123',
    }
    mockApi((key, data) => {
      if (key === 'GET /v1/admin/auth/me') return { body: session }
      if (key === 'GET /v1/admin/billing-settings') return { body: settings }
      if (key === 'PUT /v1/admin/billing-settings')
        return { body: { ...settings, ...(data as object) } }
    })
    renderAt('/admin/billing-settings', <AdminBillingSettingsPage />)
  }
  it('saves a VAT percent as basis points', async () => {
    setup()
    const toggle = await screen.findByRole('switch', { name: 'VAT applicable' })
    expect(screen.queryByLabelText('VAT rate (%)')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    fireEvent.change(screen.getByLabelText('VAT rate (%)'), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'PUT')?.data).toEqual({
        taxRateBasisPoints: 2000,
        paymentMethods: ['bank_transfer'],
        paymentInstructions: 'RIB 123',
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Billing settings saved.')
  })

  it('blocks invalid input without calling the API', async () => {
    setup()
    fireEvent.change(await screen.findByLabelText('Payment methods'), {
      target: { value: 'Bank Transfer' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/lowercase letters/)).toBeInTheDocument()
    expect(calls.some((call) => call.method === 'PUT')).toBe(false)
  })
})
