/* eslint-disable react-refresh/only-export-components -- test support module, never hot reloaded */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, vi } from 'vitest'
import { Router, useLocation } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { httpClient } from '../../../../api/http'

export type Reply = { status?: number; body?: unknown }
export const calls: { url?: string; method?: string; data?: unknown }[] = []
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
export const apiError = (status: number, code: string) => ({
  status,
  body: { code, message: `server ${code}` },
})

export function mockApi(handler: (key: string, data: unknown) => Reply | undefined) {
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
export function renderAt(path: string, ui: ReactNode) {
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
