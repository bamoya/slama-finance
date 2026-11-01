import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { RequestState } from '../../components/management/request-state'
import { ApiError } from '../../lib/api-error'
import { organizationRoutes } from './organization-routes'

const state = vi.hoisted(() => ({ permissionKeys: [] as string[], clientsError: null as unknown }))
vi.mock('../../api/generated/identity/identity', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useGetWorkspaceSession: () => ({
    isPending: false,
    error: null,
    data: {
      session: {
        user: { id: 'u', email: 'comptable@example.test', firstName: 'Sara', lastName: 'B' },
        purpose: 'full',
        permissionKeys: state.permissionKeys,
      },
      organization: { id: 'o', name: 'Atlas', slug: 'atlas', staffCount: 1 },
      subscription: { entitlements: { features: [], staffPerOrganization: null } },
    },
  }),
}))
vi.mock('../../features/organization/clients', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ClientsPage: () =>
    state.clientsError ? (
      <RequestState
        query={{ isPending: false, error: state.clientsError, refetch: () => undefined }}
      />
    ) : (
      <p>Clients list</p>
    ),
}))

function visit(path: string) {
  const { hook, history } = memoryLocation({ path, record: true })
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Router hook={hook}>{organizationRoutes}</Router>
    </QueryClientProvider>,
  )
  return history
}
beforeEach(() => {
  state.permissionKeys = ['reports.read', 'invoices.read']
  state.clientsError = null
})
describe('workspace routes', () => {
  it.each(['/workspace/clients', '/workspace/settings/staff', '/workspace/settings/roles'])(
    'shows the access-denied page inside the workspace for %s',
    async (path) => {
      visit(path)
      expect(await screen.findByRole('heading', { name: 'Restricted access' })).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Your role does not allow')
      expect(screen.getByRole('navigation', { name: 'Main navigation' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Back to dashboard' })).toHaveAttribute(
        'href',
        '/workspace/dashboard',
      )
      expect(screen.queryByText('Page not found')).not.toBeInTheDocument()
    },
  )
  it('offers the first accessible page when the dashboard is not allowed', async () => {
    state.permissionKeys = ['invoices.read']
    visit('/workspace/clients')
    expect(await screen.findByRole('link', { name: 'Open Invoices' })).toHaveAttribute(
      'href',
      '/workspace/invoices',
    )
  })
  it('denies the bare settings URL instead of reporting a missing page', async () => {
    visit('/workspace/settings')
    expect(await screen.findByRole('heading', { name: 'Restricted access' })).toBeInTheDocument()
  })
  it('opens the first allowed settings page from the bare settings URL', async () => {
    state.permissionKeys = ['bank_accounts.read']
    const history = visit('/workspace/settings')
    await vi.waitFor(() => expect(history.at(-1)).toBe('/workspace/settings/bank-accounts'))
  })
  it('keeps the real 404 for unknown paths', async () => {
    visit('/workspace/does-not-exist')
    expect(await screen.findByText('Page not found')).toBeInTheDocument()
    expect(screen.queryByText('Restricted access')).not.toBeInTheDocument()
  })
  it('renders a permitted route', async () => {
    state.permissionKeys = ['clients.read']
    visit('/workspace/clients')
    expect(await screen.findByText('Clients list')).toBeInTheDocument()
    expect(screen.queryByText('Restricted access')).not.toBeInTheDocument()
  })
  it('treats an API 403 on page load like a denied route', async () => {
    state.permissionKeys = ['clients.read']
    state.clientsError = new ApiError(403, 'FORBIDDEN', 'Forbidden')
    visit('/workspace/clients')
    expect(await screen.findByRole('heading', { name: 'Restricted access' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open Clients' })).toBeInTheDocument()
    expect(screen.queryByText('Unable to load this page')).not.toBeInTheDocument()
  })
})
