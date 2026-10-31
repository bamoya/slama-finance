import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router, useLocation } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { httpClient } from '../../../api/http'
import { PaymentHistory } from '../subscriptions/components/payment-history'
import {
  basisPointsToPercent,
  parseMethods,
  percentToBasisPoints,
  validateBilling,
} from './billing-settings'
import { AdminBillingSettingsPage } from './pages/admin-billing-settings-page'
import { AdminLoginPage } from './pages/admin-login-page'
import { AdminPaymentsPage } from './pages/admin-payments-page'

type Reply = { status?: number; body?: unknown }
const calls: { url?: string; method?: string; data?: unknown }[] = []
const clients: QueryClient[] = []
const adminId = '11111111-1111-4111-8111-111111111111'
const session = {
  admin: { id: adminId, email: 'root@example.test', name: 'Root Admin' },
  expiresAt: '2026-11-01T10:00:00Z',
  idleTimeoutSeconds: 1800,
}
const amount = {
  currency: 'MAD',
  amountHt: 10000,
  taxRateBasisPoints: 2000,
  taxAmount: 2000,
  amountTtc: 12000,
}
const payment = (over: Record<string, unknown> = {}) => ({
  id: '33333333-3333-4333-8333-333333333333',
  ownerId: '22222222-2222-4222-8222-222222222222',
  ownerEmail: 'owner@example.test',
  planCode: 'essential',
  cycle: 'monthly',
  kind: 'activation',
  status: 'submitted',
  method: 'bank_transfer',
  reference: 'REF-1',
  amount,
  coverageStart: null,
  coverageEnd: null,
  submittedAt: '2026-10-01T09:00:00Z',
  decidedAt: null,
  decidedBy: null,
  receivedReference: null,
  rejectionReason: null,
  ...over,
})
const apiError = (status: number, code: string) => ({
  status,
  body: { code, message: `server ${code}` },
})

function mockApi(handler: (key: string, data: unknown) => Reply | undefined) {
  calls.length = 0
  vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
    calls.push({ url: config.url, method: config.method, data: config.data })
    const reply = handler(`${config.method ?? 'GET'} ${config.url}`, config.data) ?? {}
    return {
      data: reply.status === 204 ? '' : JSON.stringify(reply.body ?? {}),
      status: reply.status ?? 200,
      headers: {},
    } as never
  })
}
function Location() {
  const [path] = useLocation()
  return <div data-testid="location">{path}</div>
}
function renderAt(path: string, ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={memoryLocation({ path }).hook}>
        {ui}
        <Location />
      </Router>
    </QueryClientProvider>,
  )
}
async function signIn(code = '123456') {
  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'root@example.test' },
  })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
  fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
}
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

describe('admin login and two-factor flow', () => {
  it('shows a locally rendered QR code and manual secret on enrollment, then signs in', async () => {
    mockApi((key) => {
      if (key === 'POST /v1/admin/auth/login')
        return {
          body: {
            step: 'enroll',
            enrollment: { otpauthUri: 'otpauth://totp/Slama:root?secret=ABCDEF', secret: 'ABCDEF' },
          },
        }
      if (key === 'POST /v1/admin/auth/2fa') return { body: session }
    })
    renderAt('/admin/login', <AdminLoginPage />)
    await signIn()
    expect(await screen.findByRole('img', { name: 'Authenticator QR code' })).toBeInTheDocument()
    expect(screen.getByText('ABCDEF')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/payments'))
    expect(calls.find((call) => call.url === '/v1/admin/auth/2fa')?.data).toEqual({
      code: '123456',
    })
    expect(calls.every((call) => call.url?.startsWith('/v1/admin/'))).toBe(true)
  })

  it('verifies without a QR code, keeps the form on a wrong code and restarts when the session is killed', async () => {
    let attempts = 0
    mockApi((key) => {
      if (key === 'POST /v1/admin/auth/login') return { body: { step: 'verify', enrollment: null } }
      if (key === 'POST /v1/admin/auth/2fa')
        return apiError(401, ++attempts < 2 ? 'INVALID_CODE' : 'UNAUTHENTICATED')
    })
    renderAt('/admin/login', <AdminLoginPage />)
    await signIn('000000')
    expect(screen.queryByRole('img', { name: 'Authenticator QR code' })).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('server INVALID_CODE')
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Log in again')
  })

  it('rejects a malformed code locally', async () => {
    mockApi(() => ({ body: { step: 'verify', enrollment: null } }))
    renderAt('/admin/login', <AdminLoginPage />)
    await signIn('12ab')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(calls.some((call) => call.url === '/v1/admin/auth/2fa')).toBe(false)
  })
})

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
      '/admin/owners',
      '/admin/billing-settings',
      '/admin/audit',
    ])
  })
})

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
