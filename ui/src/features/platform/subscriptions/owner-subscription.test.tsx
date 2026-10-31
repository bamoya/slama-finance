import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { OwnerSubscription } from '../../../api/generated/models'
import { httpClient } from '../../../api/http'
import { OwnerSubscriptionPage } from './pages/owner-subscription-page'

const clients: QueryClient[] = []
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
  vi.spyOn(httpClient, 'request').mockImplementation(
    async (config) =>
      ({
        data: JSON.stringify(
          config.url === '/v1/owner/subscription'
            ? subscription
            : {
                owner: {
                  id: '22222222-2222-4222-8222-222222222222',
                  email: 'owner@example.test',
                  firstName: 'Sara',
                  lastName: null,
                  locale: 'en',
                },
              },
        ),
        status: 200,
        headers: {},
      }) as never,
  )
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
