/* eslint-disable react-refresh/only-export-components -- test support module, never hot reloaded */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { Router, useLocation } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { httpClient } from '../../../../api/http'

export type Reply = { status?: number; body?: unknown }
export const calls: { url?: string; method?: string; data?: unknown; params?: unknown }[] = []
const clients: QueryClient[] = []
export const adminId = '11111111-1111-4111-8111-111111111111'
export const session = {
  admin: { id: adminId, email: 'root@example.test', name: 'Root Admin' },
  expiresAt: '2026-11-01T10:00:00Z',
  idleTimeoutSeconds: 1800,
}
export const amount = {
  currency: 'MAD',
  amountHt: 10000,
  taxRateBasisPoints: 2000,
  taxAmount: 2000,
  amountTtc: 12000,
}
export const payment = (over: Record<string, unknown> = {}) => ({
  id: '33333333-3333-4333-8333-333333333333',
  ownerId: '22222222-2222-4222-8222-222222222222',
  ownerEmail: 'owner@example.test',
  planCode: 'essential',
  planVersionNumber: 1,
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
  quoteExpiresAt: '2026-10-16T09:00:00Z',
  receivedTtc: 0,
  invoiceNumber: null,
  ...over,
})
export const apiError = (status: number, code: string) => ({
  status,
  body: { code, message: `server ${code}` },
})

export function mockApi(handler: (key: string, data: unknown) => Reply | undefined) {
  calls.length = 0
  vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
    calls.push({
      url: config.url,
      method: config.method,
      data: config.data,
      params: config.params,
    })
    const reply = handler(`${config.method ?? 'GET'} ${config.url}`, config.data) ?? {}
    return {
      data: reply.status === 204 ? '' : JSON.stringify(reply.body ?? {}),
      status: reply.status ?? 200,
      headers: {},
    } as never
  })
}
/** Routine administrator actions carry no authenticator code: the session is the authorization. */
export function expectNoFreshCode() {
  for (const call of calls)
    if (call.data && typeof call.data === 'object') expect(call.data).not.toHaveProperty('code')
}
function Location() {
  const [path] = useLocation()
  return <div data-testid="location">{path}</div>
}
export function renderAt(path: string, ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  const location = memoryLocation({ path })
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook} searchHook={location.searchHook}>
        {ui}
        <Location />
      </Router>
    </QueryClientProvider>,
  )
}

/** Registers the shared setup and teardown for an administration test file. */
export function useAdminTestLifecycle() {
  beforeEach(() => {
    // jsdom has no hit testing; the OTP input probes it for password-manager badges.
    document.elementFromPoint ??= () => null
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
}

export const ownerId = '22222222-2222-4222-8222-222222222222'
export const organizationId = '44444444-4444-4444-8444-000000000001'

/** A complete customer detail; pass overrides for the parts a test cares about. */
export function ownerDetail(over: Record<string, unknown> = {}) {
  return {
    owner: {
      id: ownerId,
      email: 'owner@example.test',
      firstName: 'Sara',
      lastName: 'Alaoui',
      locale: 'fr',
      emailVerifiedAt: '2026-09-01T09:05:00Z',
      createdAt: '2026-09-01T09:00:00Z',
      disabledAt: null,
    },
    restriction: {
      blockedAt: null,
      blockReason: null,
      deletionRequestedAt: null,
      deletionDueAt: null,
      deletionReason: null,
    },
    invitationPending: false,
    subscriptionError: null,
    subscription: {
      planCode: 'essential',
      planVersionNumber: 1,
      accessValidUntil: null,
      scheduledVersionTransition: null,
      planName: 'Essential',
      status: 'active',
      trialEndsAt: null,
      paidThroughAt: '2026-11-01T09:00:00Z',
      cycle: 'monthly',
      cancelAtPeriodEnd: false,
      graceEndsAt: null,
      blockedAt: null,
      retentionEndsAt: null,
      nextPlanCode: null,
      pendingPayment: null,
      entitlements: {
        organizations: 3,
        staffPerOrganization: 5,
        features: [],
        storageBytes: 5e9,
        businessEmails: 500,
      },
      organizationCount: 1,
      entitlementSources: [],
      usage: {
        storageBytes: 1.2e9,
        businessEmails: 40,
        emailPeriodStart: '2026-10-01T00:00:00Z',
        emailPeriodEnd: '2026-11-01T00:00:00Z',
      },
    },
    organizations: [
      {
        id: organizationId,
        name: 'Atlas Conseil',
        slug: 'atlas',
        createdAt: '2026-09-02T09:00:00Z',
        activatedAt: null,
        state: 'active',
        suspendedAt: null,
        suspensionReason: null,
      },
    ],
    payments: [],
    ...over,
  }
}
