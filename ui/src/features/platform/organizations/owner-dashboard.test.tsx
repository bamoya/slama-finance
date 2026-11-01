import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { ListOwnerOrganizationsParams, OwnerOrganization } from '../../../api/generated/models'
import { httpClient } from '../../../api/http'
import { organizationLoginUrl } from '../../../lib/platform-sites'
import { OwnerDashboardPage } from './pages/owner-dashboard-page'

const response = (data: unknown, status = 200) =>
  ({ data: JSON.stringify(data), status, headers: {} }) as never
const owner = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.test',
  firstName: 'Sara',
  lastName: null,
  locale: 'fr',
}
const makeOrg = (
  index: number,
  status: OwnerOrganization['status'] = 'active',
): OwnerOrganization => ({
  id: `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`,
  name: `Organization ${index}`,
  slug: `organization-${index}`,
  locale: 'fr',
  status,
  staffCount: 1,
  createdAt: '2026-10-28T10:00:00Z',
})
const clients: QueryClient[] = []
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  const location = memoryLocation({ path: '/', record: true })
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <OwnerDashboardPage />
      </Router>
    </QueryClientProvider>,
  )
  return location
}
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
  vi.restoreAllMocks()
})

describe('Classic owner dashboard', () => {
  it('aggregates all organization pages, presents availability and never invents financial balances', async () => {
    const organizations = Array.from({ length: 51 }, (_, index) =>
      makeOrg(index, index === 50 ? 'paused' : 'active'),
    )
    const request = vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
      if (config.url === '/api/v1/owner-auth/session') return response({ owner })
      const page = (config.params as ListOwnerOrganizationsParams).page ?? 1
      return response({
        items: organizations.slice((page - 1) * 50, page * 50),
        total: 51,
        page,
        pageSize: 50,
      })
    })
    setup()
    expect(
      await screen.findByRole('heading', { name: 'Hello Sara, here is your overview.' }),
    ).toBeInTheDocument()
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/owner/organizations',
        params: { page: 2, pageSize: 50 },
      }),
    )
    const summary = screen.getByRole('region', { name: 'Independent spaces, one account.' })
    expect(summary).toHaveTextContent('51')
    expect(screen.getByRole('region', { name: 'Needs attention' })).toHaveTextContent(
      'Organization 50',
    )
    expect(screen.getAllByLabelText('Data unavailable')).toHaveLength(4)
    expect(screen.getByText('Consolidated finances are not available yet.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Organization 0/ })).toHaveAttribute(
      'href',
      organizationLoginUrl(organizations[0]!.slug),
    )
    expect(screen.getAllByRole('link', { name: /open organization/i }).length).toBeGreaterThan(0)
    const availability = screen.getByRole('region', { name: 'Organization availability' })
    expect(availability).toHaveTextContent('Paused')
    expect(within(availability).getByText('50')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('combobox', { name: 'Organization scope' }))
    fireEvent.click(screen.getByRole('option', { name: 'Organization 50' }))
    await waitFor(() => expect(summary).not.toHaveTextContent('Organization 0'))
    expect(within(availability).queryByText('Active')).not.toBeInTheDocument()
  })
  it('shows an honest first-organization state without demo organizations or fake balances', async () => {
    vi.spyOn(httpClient, 'request').mockImplementation(async (config) =>
      response(
        config.url === '/api/v1/owner-auth/session'
          ? { owner }
          : { items: [], total: 0, page: 1, pageSize: 50 },
      ),
    )
    setup()
    expect(
      await screen.findByRole('heading', { name: 'Your first organization starts here.' }),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Financial summary')).not.toBeInTheDocument()
    expect(
      screen
        .getAllByRole('link', { name: 'New organization' })
        .every((link) => link.getAttribute('href') === '/organizations/new'),
    ).toBe(true)
  })
  it('redirects an expired owner session to owner authentication', async () => {
    vi.spyOn(httpClient, 'request').mockResolvedValue(
      response({ code: 'UNAUTHENTICATED', message: 'Unauthorized' }, 401),
    )
    const location = setup()
    await waitFor(() => expect(location.history.at(-1)).toBe('/login'))
  })
})

it('renders real owner aggregates through the platform analytics endpoint without an organization login', async () => {
  const organization = makeOrg(0)
  vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
    if (config.url === '/api/v1/owner-auth/session') return response({ owner })
    if (config.url === '/api/v1/owner/analytics/financial-summary')
      return response({
        currency: 'MAD',
        start: '2026-10-01',
        end: '2026-10-31',
        capturedAt: '2026-10-30T10:00:00Z',
        totals: {
          revenue: '1250.50',
          collected: '800.00',
          outstanding: '450.50',
          overdue: '100.00',
        },
        organizations: [
          {
            id: organization.id,
            name: organization.name,
            totals: {
              revenue: '1250.50',
              collected: '800.00',
              outstanding: '450.50',
              overdue: '100.00',
            },
          },
        ],
        series: [{ date: '2026-10-01', revenue: '1250.50', collected: '800.00' }],
      })
    return response({ items: [organization], total: 1, page: 1, pageSize: 50 })
  })
  setup()
  await waitFor(() => expect(screen.queryAllByLabelText('Data unavailable')).toHaveLength(0))
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Financial summary' })).toHaveTextContent(
      '1\u00a0250.50',
    ),
  )
  expect(
    screen.getByText(
      'Financial summaries are read-only. Log in separately to manage organization records.',
    ),
  ).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Organization 0/ })).toHaveAttribute(
    'href',
    organizationLoginUrl(organization.slug),
  )
})
