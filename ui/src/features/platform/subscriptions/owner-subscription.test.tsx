import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { OwnerSubscription } from '../../../api/generated/models'
import { httpClient } from '../../../api/http'
import { ApiError } from '../../../lib/api-error'
import { minRecheckDelayMs } from '../../../lib/use-access-deadline'
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
  customer: {
    type: 'individual',
    legalName: null,
    ice: null,
    address: null,
    registrationNumber: null,
    taxIdentifier: null,
  },
  currency: 'MAD',
  taxRateBasisPoints: 2000,
  paymentMethods: ['bank_transfer', 'cash'],
  paymentInstructions: 'Transfer to RIB 123',
  plans: [
    {
      code: 'essential',
      name: 'Essentiel',
      versionNumber: 2,
      monthlyHt: 10000,
      annualHt: 100000,
      entitlements,
    },
    {
      code: 'business',
      name: 'Business',
      versionNumber: 1,
      monthlyHt: 30000,
      annualHt: 300000,
      entitlements,
    },
  ],
}
const quoteBody = (taxRateBasisPoints: number | null, kind = 'activation') => ({
  planCode: 'essential',
  planVersionNumber: 2,
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
  planVersionNumber: 1,
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
  quoteExpiresAt: '2026-10-16T09:00:00Z',
  receivedTtc: status === 'confirmed' ? quoteBody(2000).amount.amountTtc : 0,
  invoiceNumber: status === 'confirmed' ? 'F-2026-000001' : null,
  customer: null,
})
const calls: { url?: string; method?: string; data?: unknown }[] = []
function mockApi(routes: Record<string, unknown>) {
  calls.length = 0
  vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
    calls.push({ url: config.url, method: config.method, data: config.data })
    const body = routes[`${config.method ?? 'GET'} ${config.url}`] ??
      routes[config.url ?? ''] ??
      (config.url === '/api/v1/owner/subscription/invoices'
        ? { items: [], page: 1, pageSize: 20, total: 0 }
        : undefined) ?? {
        owner: {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'owner@example.test',
          firstName: 'Sara',
          lastName: null,
          locale: 'en',
        },
      }
    if (body instanceof Error) throw body
    return { data: JSON.stringify(body), status: 200, headers: {} } as never
  })
}
function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={memoryLocation({ path: '/subscription' }).hook}>
        <OwnerSubscriptionPage />
      </Router>
    </QueryClientProvider>,
  )
}
const paidBase = {
  planCode: 'essential',
  planVersionNumber: 1,
  accessValidUntil: null,
  scheduledVersionTransition: null,
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
  entitlementSources: [],
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
    planVersionNumber: 1,
    accessValidUntil: null,
    scheduledVersionTransition: null,
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
    entitlementSources: [],
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
  mockApi({ '/api/v1/owner/subscription': subscription })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={memoryLocation({ path: '/subscription' }).hook}>
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
    '/api/v1/owner/subscription': {
      ...paidBase,
      status: 'past_due',
      graceEndsAt: '2026-12-04T10:00:00Z',
      blockedAt: '2026-12-05T10:00:00Z',
      retentionEndsAt: '2027-03-05T10:00:00Z',
      nextPlanCode: 'business',
      pendingPayment: payment('submitted'),
    },
    '/api/v1/owner/subscription/billing': catalog,
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
    '/api/v1/owner/subscription/payments': payments,
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
    '/api/v1/owner/subscription': {
      ...paidBase,
      planCode: 'trial',
      planName: 'Essai',
      status: 'trial',
      paidThroughAt: null,
      cycle: null,
      trialEndsAt: '2026-11-06T10:00:00Z',
    },
    '/api/v1/owner/subscription/billing': catalog,
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
    'POST /api/v1/owner/subscription/payments': payment('submitted'),
    'GET /api/v1/owner/subscription/payments': {
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
      customer: {
        type: 'individual',
        legalName: null,
        ice: null,
        address: null,
        registrationNumber: null,
        taxIdentifier: null,
      },
    }),
  )
  expect(screen.queryByLabelText('ICE')).not.toBeInTheDocument()
})

const trialSubscription = {
  ...paidBase,
  planCode: 'trial',
  planName: 'Essai',
  status: 'trial',
  paidThroughAt: null,
  cycle: null,
  trialEndsAt: '2026-11-06T10:00:00Z',
}
const company = {
  type: 'company',
  legalName: 'Atlas SARL',
  ice: '001234567000089',
  address: '12 rue Atlas, Rabat',
  registrationNumber: null,
  taxIdentifier: null,
}

it('asks company details at checkout, checks the ICE format, and posts the company identity', async () => {
  mockApi({
    '/api/v1/owner/subscription': trialSubscription,
    '/api/v1/owner/subscription/billing': catalog,
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
    'POST /api/v1/owner/subscription/payments': payment('submitted'),
  })
  renderPage()
  await screen.findByTestId('quote')
  fireEvent.change(screen.getByLabelText('Payment reference'), { target: { value: 'REF-9' } })
  fireEvent.click(within(screen.getByTestId('checkout-customer')).getByRole('combobox'))
  fireEvent.click(await screen.findByRole('option', { name: 'Company' }))
  fireEvent.change(screen.getByLabelText('Legal name'), { target: { value: ' Atlas SARL ' } })
  fireEvent.change(screen.getByLabelText('ICE'), { target: { value: '123' } })
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: '12 rue Atlas, Rabat' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit payment' }))
  expect(await screen.findByText('The ICE has 15 digits.')).toBeInTheDocument()
  expect(calls.some((c) => c.method === 'POST' && c.url?.endsWith('/payments'))).toBe(false)
  // The printed format, digits grouped by spaces, is accepted and sent without spaces.
  fireEvent.change(screen.getByLabelText('ICE'), { target: { value: '001 234 567 000 089' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit payment' }))
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'POST' && c.url?.endsWith('/payments'))?.data).toEqual({
      planCode: 'essential',
      cycle: 'monthly',
      method: 'bank_transfer',
      reference: 'REF-9',
      customer: company,
    }),
  )
})

it('prefills the company identity saved in the billing profile', async () => {
  mockApi({
    '/api/v1/owner/subscription': trialSubscription,
    '/api/v1/owner/subscription/billing': { ...catalog, customer: company },
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
  })
  renderPage()
  await screen.findByTestId('quote')
  const checkout = within(screen.getByTestId('checkout-customer'))
  expect(checkout.getByLabelText('Legal name')).toHaveValue('Atlas SARL')
  expect(checkout.getByLabelText('ICE')).toHaveValue('001234567000089')
})

it('shows API field errors on the company fields', async () => {
  mockApi({
    '/api/v1/owner/subscription': trialSubscription,
    '/api/v1/owner/subscription/billing': { ...catalog, customer: company },
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
    'POST /api/v1/owner/subscription/payments': new ApiError(
      400,
      'VALIDATION_ERROR',
      'Invalid',
      undefined,
      { 'customer.ice': ['Invalid ICE'] },
    ),
  })
  renderPage()
  await screen.findByTestId('quote')
  fireEvent.change(screen.getByLabelText('Payment reference'), { target: { value: 'REF-9' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit payment' }))
  const message = await screen.findByText('Invalid ICE', { selector: '[data-slot="field-error"]' })
  expect(screen.getByLabelText('ICE')).toHaveAttribute('aria-invalid', 'true')
  expect(message).toBeInTheDocument()
})

it('refreshes the billing details card after a company checkout', async () => {
  const routes: Record<string, unknown> = {
    '/api/v1/owner/subscription': trialSubscription,
    '/api/v1/owner/subscription/billing': catalog,
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
    'POST /api/v1/owner/subscription/payments': payment('submitted'),
  }
  mockApi(routes)
  renderPage()
  await screen.findByTestId('quote')
  expect(screen.getByTestId('billing-details-type')).toHaveTextContent('Individual')
  fireEvent.change(screen.getByLabelText('Payment reference'), { target: { value: 'REF-9' } })
  const checkout = within(screen.getByTestId('checkout-customer'))
  fireEvent.click(checkout.getByRole('combobox'))
  fireEvent.click(await screen.findByRole('option', { name: 'Company' }))
  fireEvent.change(checkout.getByLabelText('Legal name'), { target: { value: 'Atlas SARL' } })
  fireEvent.change(checkout.getByLabelText('ICE'), { target: { value: '001234567000089' } })
  fireEvent.change(checkout.getByLabelText('Address'), { target: { value: '12 rue Atlas, Rabat' } })
  // The submission saves the profile; the refetched catalog returns it.
  routes['/api/v1/owner/subscription/billing'] = { ...catalog, customer: company }
  fireEvent.click(screen.getByRole('button', { name: 'Submit payment' }))
  await waitFor(() =>
    expect(screen.getByTestId('billing-details-type')).toHaveTextContent('Company'),
  )
})

it('drops an unsent checkout identity when the billing details card saves another one', async () => {
  const routes: Record<string, unknown> = {
    '/api/v1/owner/subscription': trialSubscription,
    '/api/v1/owner/subscription/billing': { ...catalog, customer: company },
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
    'PUT /api/v1/owner/subscription/billing': catalog,
    'POST /api/v1/owner/subscription/payments': payment('submitted'),
  }
  mockApi(routes)
  renderPage()
  await screen.findByTestId('quote')
  const checkout = within(screen.getByTestId('checkout-customer'))
  // Touch the checkout draft (company), then switch the saved profile to individual in the card.
  fireEvent.change(checkout.getByLabelText('Legal name'), { target: { value: 'Draft SARL' } })
  fireEvent.click(screen.getByRole('button', { name: 'Edit billing details' }))
  const form = within(screen.getByTestId('details-customer'))
  fireEvent.click(form.getByRole('combobox'))
  fireEvent.click(await screen.findByRole('option', { name: 'Individual' }))
  routes['/api/v1/owner/subscription/billing'] = catalog
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.some((c) => c.method === 'PUT')).toBe(true))
  await waitFor(() =>
    expect(
      within(screen.getByTestId('checkout-customer')).queryByLabelText('Legal name'),
    ).toBeNull(),
  )
  fireEvent.change(screen.getByLabelText('Payment reference'), { target: { value: 'REF-10' } })
  fireEvent.click(screen.getByRole('button', { name: 'Submit payment' }))
  await waitFor(() =>
    expect(
      calls.find((c) => c.method === 'POST' && c.url?.endsWith('/payments'))?.data,
    ).toMatchObject({ customer: { type: 'individual', legalName: null } }),
  )
})

it('edits the saved billing details with a PUT and refreshes the card', async () => {
  const routes: Record<string, unknown> = {
    '/api/v1/owner/subscription': paidBase,
    '/api/v1/owner/subscription/billing': catalog,
    'PUT /api/v1/owner/subscription/billing': { ...catalog, customer: company },
  }
  mockApi(routes)
  renderPage()
  expect(await screen.findByTestId('billing-details-type')).toHaveTextContent('Individual')
  fireEvent.click(screen.getByRole('button', { name: 'Edit billing details' }))
  const form = within(screen.getByTestId('details-customer'))
  fireEvent.click(form.getByRole('combobox'))
  fireEvent.click(await screen.findByRole('option', { name: 'Company' }))
  fireEvent.change(screen.getByLabelText('Legal name'), { target: { value: 'Atlas SARL' } })
  fireEvent.change(screen.getByLabelText('ICE'), { target: { value: '001234567000089' } })
  fireEvent.change(screen.getByLabelText('Address'), { target: { value: '12 rue Atlas, Rabat' } })
  // The server now returns the saved identity on the refetch.
  routes['/api/v1/owner/subscription/billing'] = { ...catalog, customer: company }
  fireEvent.click(screen.getByRole('button', { name: 'Save' }))
  await waitFor(() => expect(calls.find((c) => c.method === 'PUT')?.data).toEqual(company))
  expect(await screen.findByText('Atlas SARL')).toBeInTheDocument()
})

it('hides VAT when no tax rate is configured and labels upgrades as prorated', async () => {
  mockApi({
    '/api/v1/owner/subscription': paidBase,
    '/api/v1/owner/subscription/billing': { ...catalog, taxRateBasisPoints: null },
    'POST /api/v1/owner/subscription/quote': quoteBody(null, 'upgrade'),
    '/api/v1/owner/subscription/payments': payments,
  })
  renderPage()
  const quote = await screen.findByTestId('quote')
  expect(quote).toHaveTextContent('Upgrade (prorated)')
  expect(within(quote).queryByText(/VAT/)).not.toBeInTheDocument()
  expect(quote).toHaveTextContent('100,00 DH')
})

it('confirms before cancelling at period end', async () => {
  mockApi({
    '/api/v1/owner/subscription': paidBase,
    '/api/v1/owner/subscription/billing': catalog,
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
    '/api/v1/owner/subscription/payments': payments,
    'PUT /api/v1/owner/subscription/cancellation': { ...paidBase, cancelAtPeriodEnd: true },
  })
  renderPage()
  fireEvent.click(await screen.findByRole('button', { name: 'Cancel at period end' }))
  expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm cancellation' }))
  await waitFor(() =>
    expect(calls.find((c) => c.method === 'PUT')?.data).toEqual({ cancelAtPeriodEnd: true }),
  )
})

it('shows a neutral notice instead of an error when the next period is already covered', async () => {
  mockApi({
    '/api/v1/owner/subscription': paidBase,
    '/api/v1/owner/subscription/billing': catalog,
    'POST /api/v1/owner/subscription/quote': new ApiError(
      409,
      'RENEWAL_EXISTS',
      'The next period is already paid.',
      'req-1',
    ),
    'GET /api/v1/owner/subscription/payments': { data: [] },
  })
  renderPage()
  expect(await screen.findByTestId('checkout-notice')).toHaveTextContent(
    'Your next period is already covered until',
  )
  expect(screen.queryByText(/Reference:/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Submit payment' })).not.toBeInTheDocument()
})

it('does not request a quote and hides the payment form when suspended', async () => {
  mockApi({
    '/api/v1/owner/subscription': { ...paidBase, status: 'suspended' },
    '/api/v1/owner/subscription/billing': catalog,
    'GET /api/v1/owner/subscription/payments': { data: [] },
  })
  renderPage()
  expect(await screen.findByTestId('checkout-notice')).toHaveTextContent(
    'Your subscription is suspended',
  )
  expect(calls.some((c) => c.url?.endsWith('/quote'))).toBe(false)
  expect(screen.queryByRole('button', { name: 'Submit payment' })).not.toBeInTheDocument()
  // The API refuses cancellation unless active, so the action is not offered.
  expect(screen.queryByRole('button', { name: /cancel at period end/i })).not.toBeInTheDocument()
})

it('marks customer-specific allowances by origin and end date, never internal notes', async () => {
  mockApi({
    '/api/v1/owner/subscription': {
      ...paidBase,
      entitlements: { ...paidBase.entitlements, staffPerOrganization: 6 },
      entitlementSources: [
        {
          entitlementKey: 'staffPerOrganization',
          source: 'override',
          effectiveUntil: '2026-12-01T10:00:00Z',
        },
        { entitlementKey: 'storageBytes', source: 'plan', effectiveUntil: null },
        { entitlementKey: 'custom_domains', source: 'override', effectiveUntil: null },
      ],
    },
    '/api/v1/owner/subscription/billing': catalog,
    '/api/v1/owner/subscription/payments': [],
  })
  renderPage()
  const members = (await screen.findByText('Members per organization')).parentElement!
  expect(members).toHaveTextContent('6')
  expect(members).toHaveTextContent(/Custom allowance until/)
  expect(screen.getByText('Storage allowance').parentElement).not.toHaveTextContent(
    'Custom allowance',
  )
  expect(screen.getByText('Some features of your subscription are customized.')).toBeVisible()
})

it('shows the pinned version of the current plan apart from the version currently on sale', async () => {
  mockApi({
    '/api/v1/owner/subscription': paidBase,
    '/api/v1/owner/subscription/billing': catalog,
    'POST /api/v1/owner/subscription/quote': quoteBody(2000, 'renewal'),
    '/api/v1/owner/subscription/payments': { data: [payment('confirmed')] },
  })
  renderPage()
  // Current coverage stays on its purchased version 1.
  expect(await screen.findByTestId('plan-version')).toHaveTextContent('Version 1')
  // The selling terms and the API quote are version 2; no client side claim links the two.
  expect(await screen.findByTestId('quote-version')).toHaveTextContent('Version 2')
  expect(screen.getByRole('combobox', { name: 'Plan' })).toHaveTextContent('Essentiel · Version 2')
  expect(screen.queryByTestId('version-transition')).not.toBeInTheDocument()
  const history = await screen.findByText('Payment history')
  expect(history.closest('[data-slot="card"]')).toHaveTextContent('Version 1')
  // The client sends the plan and cycle only: the API selects the version and prices it.
  const quoteCall = calls.find((call) => call.method === 'POST')
  expect(quoteCall?.data).toEqual({ planCode: 'essential', cycle: 'monthly' })
})

it('shows a notified version transition with its target version and date', async () => {
  mockApi({
    '/api/v1/owner/subscription': {
      ...paidBase,
      scheduledVersionTransition: {
        targetVersionNumber: 2,
        effectiveAt: '2026-12-01T10:00:00Z',
        noticeSentAt: '2026-10-25T10:00:00Z',
      },
    },
    '/api/v1/owner/subscription/billing': catalog,
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
    '/api/v1/owner/subscription/payments': payments,
  })
  renderPage()
  const transition = await screen.findByTestId('version-transition')
  expect(transition).toHaveTextContent('Version 2 of your plan applies from')
  expect(transition).toHaveTextContent('01-12-2026')
  expect(screen.getByTestId('plan-version')).toHaveTextContent('Version 1')
})

it('reads the subscription again at accessValidUntil and shows the new server state', async () => {
  let reads = 0
  const answers = [
    { ...paidBase, accessValidUntil: new Date(Date.now() + 1200).toISOString() },
    { ...paidBase, status: 'past_due', planVersionNumber: 2, accessValidUntil: null },
  ]
  vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
    const body =
      config.url === '/api/v1/owner/subscription'
        ? answers[Math.min(reads++, 1)]
        : config.url === '/api/v1/owner/subscription/billing'
          ? catalog
          : config.url === '/api/v1/owner/subscription/payments'
            ? payments
            : config.method === 'POST'
              ? quoteBody(2000)
              : {
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
  renderPage()
  expect(await screen.findByTestId('subscription-status')).toHaveTextContent('Active')
  expect(reads).toBe(1)
  expect(await screen.findByText('Payment overdue', {}, { timeout: 4000 })).toBeInTheDocument()
  expect(screen.getByTestId('plan-version')).toHaveTextContent('Version 2')
  expect(reads).toBe(2)
})

it('keeps showing the last server state when the contract call fails', async () => {
  mockApi({
    '/api/v1/owner/subscription': new ApiError(503, 'SUBSCRIPTION_CATALOG_UNAVAILABLE', 'x'),
  })
  renderPage()
  expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
  expect(screen.queryByTestId('plan-version')).not.toBeInTheDocument()
  expect(screen.queryByTestId('subscription-status')).not.toBeInTheDocument()
})

it('recovers on its own when the read at accessValidUntil fails, without focus or remount', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  try {
    let reads = 0
    const answers = [
      { ...paidBase, accessValidUntil: new Date(Date.now() + 1200).toISOString() },
      new ApiError(503, 'SUBSCRIPTION_PERIODS_INCONSISTENT', 'x'),
      { ...paidBase, status: 'past_due', planVersionNumber: 2, accessValidUntil: null },
    ]
    vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
      const body =
        config.url === '/api/v1/owner/subscription'
          ? answers[Math.min(reads++, 2)]
          : config.url === '/api/v1/owner/subscription/billing'
            ? catalog
            : config.url === '/api/v1/owner/subscription/payments'
              ? payments
              : config.method === 'POST'
                ? quoteBody(2000)
                : {
                    owner: {
                      id: '22222222-2222-4222-8222-222222222222',
                      email: 'owner@example.test',
                      firstName: 'Sara',
                      lastName: null,
                      locale: 'en',
                    },
                  }
      if (body instanceof Error) throw body
      return { data: JSON.stringify(body), status: 200, headers: {} } as never
    })
    renderPage()
    expect(await screen.findByTestId('subscription-status')).toHaveTextContent('Active')
    await act(() => vi.advanceTimersByTimeAsync(1200))
    await waitFor(() => expect(reads).toBe(2))
    // The failed boundary read leaves the response and deadline unchanged; nothing else triggers a read.
    await act(() => vi.advanceTimersByTimeAsync(minRecheckDelayMs - 100))
    expect(reads).toBe(2)
    await act(() => vi.advanceTimersByTimeAsync(200))
    expect(await screen.findByText('Payment overdue')).toBeInTheDocument()
    expect(screen.getByTestId('plan-version')).toHaveTextContent('Version 2')
    expect(reads).toBe(3)
  } finally {
    vi.useRealTimers()
  }
})

it('keeps a withdrawn current plan selectable for renewal on its pin, priced only by the API quote', async () => {
  const quotes = {
    essential: { ...quoteBody(2000, 'renewal'), planVersionNumber: 1 },
    business: {
      ...quoteBody(2000, 'upgrade'),
      planCode: 'business',
      planVersionNumber: 1,
      amount: { ...quoteBody(2000).amount, amountHt: 20000, taxAmount: 4000, amountTtc: 24000 },
    },
  }
  calls.length = 0
  vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
    calls.push({ url: config.url, method: config.method, data: config.data })
    const body =
      config.method === 'POST' && config.url === '/api/v1/owner/subscription/quote'
        ? quotes[(config.data as { planCode: keyof typeof quotes }).planCode]
        : config.url === '/api/v1/owner/subscription'
          ? paidBase
          : config.url === '/api/v1/owner/subscription/billing'
            ? // Essential is withdrawn from sale: only Business is offered to new customers.
              { ...catalog, plans: catalog.plans.filter((p) => p.code !== 'essential') }
            : config.url === '/api/v1/owner/subscription/payments'
              ? { data: [payment('confirmed')] }
              : {
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
  renderPage()
  const plan = await screen.findByRole('combobox', { name: 'Plan' })
  expect(plan).toHaveTextContent('Essentiel · Version 1 — Current plan, renewal on your version')
  expect(await screen.findByTestId('quote-version')).toHaveTextContent('Version 1')
  expect(screen.getByTestId('quote')).toHaveTextContent('Renewal')
  expect(screen.getByTestId('quote')).toHaveTextContent('100,00 DH')

  fireEvent.keyDown(plan, { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: /^Business/ }))
  await waitFor(() => expect(screen.getByTestId('quote')).toHaveTextContent('200,00 DH'))

  fireEvent.keyDown(plan, { key: 'ArrowDown' })
  fireEvent.click(await screen.findByRole('option', { name: /Current plan, renewal/ }))
  await waitFor(() => expect(screen.getByTestId('quote')).toHaveTextContent('Renewal'))
  expect(screen.getByTestId('quote-version')).toHaveTextContent('Version 1')
  expect(screen.getByTestId('quote')).toHaveTextContent('100,00 DH')
  expect(calls.filter((call) => call.method === 'POST').map((call) => call.data)).toEqual([
    { planCode: 'essential', cycle: 'monthly' },
    { planCode: 'business', cycle: 'monthly' },
    { planCode: 'essential', cycle: 'monthly' },
  ])
})

it('does not offer renewal of a withdrawn plan once the subscription has expired', async () => {
  mockApi({
    '/api/v1/owner/subscription': { ...paidBase, status: 'expired' },
    '/api/v1/owner/subscription/billing': {
      ...catalog,
      plans: catalog.plans.filter((p) => p.code !== 'essential'),
    },
    'POST /api/v1/owner/subscription/quote': new ApiError(409, 'PLAN_NOT_SELLABLE', 'x'),
    '/api/v1/owner/subscription/payments': { data: [payment('confirmed')] },
  })
  renderPage()
  const plan = await screen.findByRole('combobox', { name: 'Plan' })
  fireEvent.keyDown(plan, { key: 'ArrowDown' })
  expect(await screen.findByRole('option', { name: /^Business/ })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /Current plan, renewal/ })).not.toBeInTheDocument()
  expect(screen.getAllByRole('option')).toHaveLength(1)
})

it('explains missing payment instructions instead of showing an empty box', async () => {
  mockApi({
    '/api/v1/owner/subscription': {
      ...paidBase,
      planCode: 'trial',
      planName: 'Essai',
      status: 'trial',
      paidThroughAt: null,
      cycle: null,
      trialEndsAt: '2026-11-06T10:00:00Z',
    },
    '/api/v1/owner/subscription/billing': { ...catalog, paymentInstructions: '  ' },
    'POST /api/v1/owner/subscription/quote': quoteBody(2000),
    '/api/v1/owner/subscription/payments': { data: [] },
  })
  renderPage()
  expect(await screen.findByTestId('payment-instructions')).toHaveTextContent(
    'Payment instructions are not available yet. Contact us before paying.',
  )
})

it('keeps wide history tables from widening the page on small screens', async () => {
  mockApi({
    '/api/v1/owner/subscription': paidBase,
    '/api/v1/owner/subscription/billing': catalog,
    '/api/v1/owner/subscription/payments': { data: [] },
  })
  renderPage()
  // An implicit single column is sized to its widest table; minmax(0, 1fr) lets the tables scroll.
  expect(await screen.findByTestId('subscription-layout')).toHaveClass('grid-cols-1')
})
