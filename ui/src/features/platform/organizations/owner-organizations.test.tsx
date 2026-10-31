import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { getGetOwnerSessionQueryKey } from '../../../api/generated/identity/identity'
import type { ListOwnerOrganizationsParams, OwnerOrganization } from '../../../api/generated/models'
import { httpClient } from '../../../api/http'
import { sessionKey } from '../../organization/identity/auth/hooks/use-session'
import { OwnerAccountPage } from '../identity/pages/owner-account-page'
import { OwnerAuthPage } from '../identity/pages/owner-auth-page'
import { OwnerOrganizationPage } from './pages/owner-organization-page'
import { OwnerOrganizationsPage } from './pages/owner-organizations-page'

const owner = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.test',
  firstName: null,
  lastName: null,
  locale: 'fr',
}
const organization: OwnerOrganization = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Slama Agricole',
  slug: 'slama-agricole',
  locale: 'fr',
  status: 'active',
  createdAt: '2026-10-28T10:00:00.000Z',
  staffCount: 2,
}
const clients: QueryClient[] = []
const response = (data: unknown, status = 200) =>
  ({ data: JSON.stringify(data), status, headers: {} }) as never
function setup(node: ReactNode, path = '/') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  const location = memoryLocation({ path, record: true })
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>{node}</Router>
    </QueryClientProvider>,
  )
  return { client, location }
}
beforeEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState({}, '', '/')
})
afterEach(() => clients.splice(0).forEach((client) => client.clear()))

describe('Owner organization portal', () => {
  it('renders real owned organizations and filters through the generated API', async () => {
    const request = vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
      if (config.url === '/api/v1/owner-auth/session') return response({ owner })
      const filtered = !!(config.params as ListOwnerOrganizationsParams | undefined)?.q
      return response({
        items: filtered
          ? [organization]
          : [
              organization,
              {
                ...organization,
                id: '44444444-4444-4444-8444-444444444444',
                name: 'Atlas',
                slug: 'atlas',
              },
            ],
        total: filtered ? 1 : 2,
        page: 1,
        pageSize: 12,
      })
    })
    setup(<OwnerOrganizationsPage />)
    const link = await screen.findByRole('link', { name: /Slama Agricole/ })
    expect(link).toHaveAttribute('href', `/organizations/${organization.id}`)
    expect(screen.getByRole('link', { name: /Atlas/ })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search organizations'), { target: { value: 'Slama' } })
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/owner/organizations',
          params: expect.objectContaining({ q: 'Slama', page: 1 }),
        }),
      ),
    )
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Atlas/ })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('navigation', { name: 'Table pagination' })).toBeInTheDocument()
  })
  it('shows organization identity and owner access without linking to unscoped finance', async () => {
    vi.spyOn(httpClient, 'request').mockImplementation(async (config) =>
      response(config.url === '/api/v1/owner-auth/session' ? { owner } : organization),
    )
    setup(
      <OwnerOrganizationPage organizationId={organization.id} />,
      `/organizations/${organization.id}`,
    )
    expect(await screen.findByRole('heading', { name: 'Slama Agricole' })).toBeInTheDocument()
    expect(screen.getByText('Organization owner')).toBeInTheDocument()
    expect(screen.getByText('28-10-2026')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /dashboard/i })).not.toBeInTheDocument()
  })
  it('keeps paused organization details available in the owner portal', async () => {
    vi.spyOn(httpClient, 'request').mockImplementation(async (config) =>
      response(
        config.url === '/api/v1/owner-auth/session'
          ? { owner }
          : { ...organization, status: 'paused' },
      ),
    )
    setup(<OwnerOrganizationPage organizationId={organization.id} />)
    expect(await screen.findByText('Paused')).toBeInTheDocument()
    expect(
      screen.queryByRole('heading', { name: 'Organization temporarily unavailable' }),
    ).not.toBeInTheDocument()
  })
  it('clears old owner metadata before sign-in without clearing staff authentication', async () => {
    vi.spyOn(httpClient, 'request').mockResolvedValue(response({ owner }))
    const { client, location } = setup(<OwnerAuthPage mode="login" />, '/login')
    client.setQueryData(['/api/v1/owner/organizations'], { private: 'previous-owner' })
    client.setQueryData(sessionKey, { private: 'independent-staff' })
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: owner.email } })
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'owner-password-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/'))
    expect(client.getQueryData(['/api/v1/owner/organizations'])).toBeUndefined()
    expect(client.getQueryData(sessionKey)).toEqual({ private: 'independent-staff' })
    expect(client.getQueryData(getGetOwnerSessionQueryKey())).toEqual({ owner })
  })
  it('clears owner metadata on logout and preserves the staff session', async () => {
    vi.spyOn(httpClient, 'request').mockImplementation(async (config) =>
      config.url === '/api/v1/owner-auth/logout' ? response(undefined, 204) : response({ owner }),
    )
    const { client, location } = setup(<OwnerAccountPage />, '/account')
    client.setQueryData(['/api/v1/owner/organizations'], { private: 'owner-metadata' })
    client.setQueryData(sessionKey, { private: 'independent-staff' })
    await screen.findByText(owner.email)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/login'))
    expect(client.getQueryData(['/api/v1/owner/organizations'])).toBeUndefined()
    expect(client.getQueryData(sessionKey)).toEqual({ private: 'independent-staff' })
  })
})
