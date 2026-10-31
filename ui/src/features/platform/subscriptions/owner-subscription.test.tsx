import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { OwnerSubscription } from '../../../api/generated/models'
import { httpClient } from '../../../api/http'
import { OwnerSubscriptionPage } from './pages/owner-subscription-page'

const clients: QueryClient[] = []
const entitlements = {
  organizations: 1,
  staffPerOrganization: 2,
  storageBytes: 1e9,
  businessEmails: 50,
  features: ['business_emails'],
}
const catalog = {
  currency: 'MAD',
  taxRateBasisPoints: 2000,
  paymentMethods: ['bank_transfer', 'cash'],
  paymentInstructions: 'Transfer to RIB 123',
  plans: [
    { code: 'essential', name: 'Essentiel', monthlyHt: 10000, annualHt: 100000, entitlements },
    { code: 'business', name: 'Business', monthlyHt: 30000, annualHt: 300000, entitlements },
  ],
}
const quoteBody = (taxRateBasisPoints: number | null, kind = 'activation') => ({
  planCode: 'essential',
  cycle: 'monthly',
  kind,
  amount: {
    currency: 'MAD',
    amountHt: 10000,
    taxRateBasisPoints,
    taxAmount: taxRateBasisPoints === null ? 0 : 2000,
    amountTtc: taxRateBasisPoints === null ? 10000 : 12000,
  },
  coverageStart: '2026-11-01T10:00:00Z',
  coverageEnd: '2026-12-01T10:00:00Z',
})
const payment = (status: string, reference = 'REF-1') => ({
  id: '33333333-3333-4333-8333-333333333333',
  planCode: 'essential',
  cycle: 'monthly',
  kind: 'activation',
  status,
  method: 'cash',
  reference,
  amount: quoteBody(2000).amount,
  coverageStart: status === 'confirmed' ? '2026-10-01T10:00:00Z' : null,
  coverageEnd: status === 'confirmed' ? '2026-11-01T10:00:00Z' : null,
  submittedAt: '2026-10-01T09:00:00Z',
  decidedAt: status === 'submitted' ? null : '2026-10-01T10:00:00Z',
  rejectionReason: status === 'rejected' ? 'Transfer not received' : null,
})
const calls: { url?: string; method?: string; data?: unknown }[] = []
function mockApi(routes: Record<string, unknown>) {
  calls.length = 0
  vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
    calls.push({ url: config.url, method: config.method, data: config.data })
    const body = routes[`${config.method ?? 'GET'} ${config.url}`] ??
      routes[config.url ?? ''] ?? {
        owner: {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'owner@example.test',
          firstName: 'Sara',
          lastName: null,
          locale: 'en',
        },
      }
    return { data: JSON.stringify(body), status: 200, headers: {} } as never
  })
}
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={memoryLocation({ path: '/owner/subscription' }).hook}>
        <OwnerSubscriptionPage />
      </Router>
    </QueryClientProvider>,
  )
}
const paidBase = {
  planCode: 'essential',
  planName: 'Essentiel',
  status: 'active',
  trialEndsAt: null,
  paidThroughAt: '2026-12-01T10:00:00Z',
  cycle: 'monthly',
  cancelAtPeriodEnd: false,
  graceEndsAt: null,
  blockedAt: null,
  retentionEndsAt: null,
  nextPlanCode: null,
  pendingPayment: null,
  organizationCount: 1,
  entitlements: {
    organizations: 1,
    staffPerOrganization: 2,
    storageBytes: 1e9,
    businessEmails: 50,
    features: [],
  },
  usage: { storageBytes: 0, businessEmails: 0, emailPeriodStart: null, emailPeriodEnd: null },
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})
it('shows real pooled consumption, quota warnings and the trial-wide end date', async () => {
  const subscription: OwnerSubscription = {
    planCode: 'trial',
    planName: 'Essai gratuit',
    status: 'trial',
    trialEndsAt: '2026-11-06T10:00:00Z',
    paidThroughAt: null,
    cycle: null,
    cancelAtPeriodEnd: false,
    graceEndsAt: null,
    blockedAt: null,
    retentionEndsAt: null,
    nextPlanCode: null,
    pendingPayment: null,
    organizationCount: 1,
    entitlements: {
      organizations: 1,
      staffPerOrganization: 2,
      storageBytes: 1e9,
      businessEmails: 50,
      features: ['business_emails'],
    },
    usage: {
      storageBytes: 900000000,
      businessEmails: 50,
      emailPeriodStart: '2026-10-30T10:00:00Z',
      emailPeriodEnd: '2026-11-06T10:00:00Z',
    },
  }
  mockApi({ '/v1/owner/subscription': subscription })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={memoryLocation({ path: '/owner/subscription' }).hook}>
        <OwnerSubscriptionPage />
      </Router>
    </QueryClientProvider>,
  )
  expect(await screen.findByRole('progressbar', { name: 'Storage used' })).toHaveAttribute(
    'aria-valuenow',
    '0.9',
  )
  expect(screen.getByRole('progressbar', { name: 'Business emails queued' })).toHaveAttribute(
    'aria-valuenow',
    '50',
  )
  expect(screen.getByText('Approaching your allowance')).toBeInTheDocument()
  expect(screen.getByText('Allowance reached')).toBeInTheDocument()
  expect(screen.getByText(/Trial allowance ends/)).toHaveTextContent('06-11-2026')
})

const payments = { data: [] }
it('shows exact coverage, grace, retention, next plan and a pending payment notice', async () => {
  mockApi({
    '/v1/owner/subscription': {
      ...paidBase,
      status: 'past_due',
      graceEndsAt: '2026-12-04T10:00:00Z',
      blockedAt: '2026-12-05T10:00:00Z',
      retentionEndsAt: '2027-03-05T10:00:00Z',
      nextPlanCode: 'business',
      pendingPayment: payment('submitted'),
    },
    '/v1/owner/subscription/billing': catalog,
    'POST /v1/owner/subscription/quote': quoteBody(2000),
    '/v1/owner/subscription/payments': payments,
  })
  renderPage()
  expect(await screen.findByText('Payment overdue')).toBeInTheDocument()
  expect(screen.getByText(/Covered until/).parentElement).toHaveTextContent('01-12-2026')
  expect(screen.getByText(/Grace period ends/).parentElement).toHaveTextContent('04-12-2026')
  expect(screen.getByText(/Access blocked since/).parentElement).toHaveTextContent('05-12-2026')
  expect(screen.getByText(/Data retained until/).parentElement).toHaveTextContent('05-03-2027')
  expect(screen.getByText(/Next plan/).parentElement).toHaveTextContent('Business')
  expect(screen.getByTestId('pending-payment')).toHaveTextContent('Payment awaiting verification')
  expect(await screen.findByRole('button', { name: 'Submit payment' })).toBeDisabled()
  // A paid plan no longer shows the trial explanation.
  expect(screen.queryByText(/Trial ends/)).not.toBeInTheDocument()
  expect(screen.queryByText(/free trial lasts/)).not.toBeInTheDocument()
})

it('shows HT, VAT and TTC from the quote before submitting, and posts the payment', async () => {
  mockApi({
    '/v1/owner/subscription': {
      ...paidBase,
      planCode: 'trial',
      planName: 'Essai',
      status: 'trial',
      paidThroughAt: null,
      cycle: null,
      trialEndsAt: '2026-11-06T10:00:00Z',
    },
    '/v1/owner/subscription/billing': catalog,
    'POST /v1/owner/subscription/quote': quoteBody(2000),
    'POST /v1/owner/subscription/payments': payment('submitted'),
    'GET /v1/owner/subscription/payments': {
      data: [payment('confirmed', 'OLD-1')],
    },
  })
  renderPage()
  const quote = await screen.findByTestId('quote')
  expect(quote).toHaveTextContent('Activation')
  expect(quote).toHaveTextContent('100,00 DH')
  expect(quote).toHaveTextContent('VAT (20%)')
  expect(quote).toHaveTextContent('120,00 DH')
  expect(screen.getByTestId('payment-instructions')).toHaveTextContent('Transfer to RIB 123')
  expect(screen.getByText(/only after an administrator verifies/)).toBeInTheDocument()
  expect(await screen.findByText('OLD-1')).toBeInTheDocument()
  // Payment method codes are shown with readable names.
  expect(screen.getByRole('combobox', { name: 'Payment method' })).toHaveTextContent(
    'Bank transfer',
  )
  expect(screen.getByRole('cell', { name: 'Cash' })).toBeInTheDocument()
  expect(screen.getByText(/free trial lasts/)).toBeInTheDocument()
  const submit = screen.getByRole('button', { name: 'Submit payment' })
  expect(submit).toBeDisabled()
  fireEvent.change(screen.getByLabelText('Payment reference'), { target: { value: ' REF-9 ' } })
  fireEvent.click(submit)
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'POST' && c.url?.endsWith('/payments'))?.data).toEqual({
      planCode: 'essential',
      cycle: 'monthly',
      method: 'bank_transfer',
      reference: 'REF-9',
    }),
  )
})

it('hides VAT when no tax rate is configured and labels upgrades as prorated', async () => {
  mockApi({
    '/v1/owner/subscription': paidBase,
    '/v1/owner/subscription/billing': { ...catalog, taxRateBasisPoints: null },
    'POST /v1/owner/subscription/quote': quoteBody(null, 'upgrade'),
    '/v1/owner/subscription/payments': payments,
  })
  renderPage()
  const quote = await screen.findByTestId('quote')
  expect(quote).toHaveTextContent('Upgrade (prorated)')
  expect(within(quote).queryByText(/VAT/)).not.toBeInTheDocument()
  expect(quote).toHaveTextContent('100,00 DH')
})

it('confirms before cancelling at period end', async () => {
  mockApi({
    '/v1/owner/subscription': paidBase,
    '/v1/owner/subscription/billing': catalog,
    'POST /v1/owner/subscription/quote': quoteBody(2000),
    '/v1/owner/subscription/payments': payments,
    'PUT /v1/owner/subscription/cancellation': { ...paidBase, cancelAtPeriodEnd: true },
  })
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel at period end' }))
  expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm cancellation' }))
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'PUT')?.data).toEqual({ cancelAtPeriodEnd: true }),
  )
})
