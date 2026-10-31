import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { getGetOwnerSessionQueryKey } from '../../../api/generated/identity/identity'
import type { OwnerOnboarding, SaveOwnerOnboarding } from '../../../api/generated/models'
import { httpClient } from '../../../api/http'
import { publicRoutes } from '../../../app/router/public-routes'

const id = '33333333-3333-4333-8333-333333333333'
const owner = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.test',
  firstName: 'Sara',
  lastName: null,
  locale: 'en',
}
const response = (data: unknown, status = 200) =>
  ({ data: JSON.stringify(data), status, headers: {} }) as never
const initial = (step = 2): OwnerOnboarding => ({
  organization: {
    id,
    name: 'Atelier Atlas',
    slug: 'atelier-atlas',
    status: 'setup',
    staffCount: 0,
    locale: 'en',
    createdAt: '2026-10-30T10:00:00Z',
  },
  configuration: {
    name: 'Atelier Atlas',
    activity: null,
    company: {},
    branding: { accentColor: '#a77b28' },
    defaults: {
      layout: 'essential',
      language: 'en',
      currency: 'MAD',
      paymentDueDays: 15,
      estimateValidDays: 15,
      compact: false,
      vatEnabled: false,
      vatRate: 0,
    },
    invitations: [],
  },
  currentStep: step,
  version: 1,
  completedAt: null,
})
const clients: QueryClient[] = []
function setup(start?: OwnerOnboarding) {
  let stored = start
  let conflict = false
  const request = vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
    if (config.url === '/v1/owner-auth/session') return response({ owner })
    if (config.url === '/v1/owner/organizations' && config.method === 'POST') {
      const body = config.data as { name: string; requestId: string }
      stored = initial()
      stored.organization.id = body.requestId
      stored.organization.name = body.name
      stored.configuration.name = body.name
      return response(stored, 201)
    }
    if (config.url === '/v1/owner/organizations')
      return response({
        items: stored ? [stored.organization] : [],
        page: 1,
        pageSize: 12,
        total: stored ? 1 : 0,
      })
    if (config.url?.endsWith('/onboarding/complete')) {
      stored = { ...stored!, version: stored!.version + 1, completedAt: '2026-10-30T12:00:00Z' }
      return response(stored)
    }
    if (config.url?.endsWith('/onboarding') && config.method === 'PUT') {
      if (conflict)
        return response(
          {
            code: 'VERSION_CONFLICT',
            message:
              'This setup was changed in another tab. Reload the saved version before continuing.',
          },
          409,
        )
      const data = config.data as SaveOwnerOnboarding
      stored = {
        ...stored!,
        version: stored!.version + 1,
        currentStep: data.currentStep,
        configuration: data.configuration,
      }
      return response(stored)
    }
    if (config.url?.endsWith('/onboarding')) return response(stored)
    throw new Error('Unexpected request ' + config.method + ' ' + config.url)
  })
  const location = memoryLocation({
    path: start ? `/owner/organizations/${id}/setup` : '/owner/organizations/new',
    record: true,
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <Switch>{publicRoutes}</Switch>
      </Router>
    </QueryClientProvider>,
  )
  return {
    client,
    request,
    location,
    conflict: () => {
      conflict = true
    },
    stored: () => stored,
  }
}
beforeEach(() => {
  window.scrollTo = vi.fn()
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
  clients.splice(0).forEach((c) => c.clear())
  vi.restoreAllMocks()
})
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Continue' }))

describe('Guided owner organization onboarding', () => {
  it('creates a real draft, accepts empty optional company data and completes all six steps', async () => {
    const { location, stored, request } = setup()
    fireEvent.change(await screen.findByLabelText(/^Organization name/), {
      target: { value: 'Maison Atlas' },
    })
    next()
    await screen.findByRole('heading', { name: 'Company identity' })
    expect(location.history.at(-1)).toMatch(/\/owner\/organizations\/[a-f0-9-]+\/setup$/)
    next()
    await screen.findByRole('heading', { name: 'Brand identity' })
    next()
    await screen.findByRole('heading', { name: 'Document defaults' })
    expect(screen.getByRole('switch', { name: 'Apply VAT by default' })).toHaveAttribute(
      'data-state',
      'unchecked',
    )
    expect(screen.queryByLabelText('VAT rate (%)')).not.toBeInTheDocument()
    next()
    await screen.findByRole('heading', { name: 'Team' })
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
    next()
    await screen.findByRole('heading', { name: 'Review & create' })
    fireEvent.click(screen.getByRole('button', { name: 'Create my organization' }))
    expect(
      await screen.findByRole('heading', { name: 'Your organization is created.' }),
    ).toBeInTheDocument()
    expect(stored()!.configuration.company).toEqual({})
    expect(stored()!.organization.status).toBe('setup')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: expect.stringContaining('/onboarding/complete'),
      }),
    )
  })
  it('preserves changes when going back and saves the current step on exit', async () => {
    const { stored, location } = setup(initial(2))
    fireEvent.change(await screen.findByLabelText(/^Phone numbers/), {
      target: { value: '06 11 22 33 44 / 05 22 33 44 55' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(screen.getByLabelText(/^Organization name/)).toHaveValue('Atelier Atlas')
    next()
    await screen.findByRole('heading', { name: 'Company identity' })
    expect(screen.getByLabelText(/^Phone numbers/)).toHaveValue('06 11 22 33 44 / 05 22 33 44 55')
    fireEvent.click(screen.getByRole('button', { name: 'Save & exit' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/owner/organizations'))
    expect(stored()!.currentStep).toBe(2)
  })
  it('shows VAT only after opting in and retains the editable values on a conflict', async () => {
    const view = setup(initial(4))
    const toggle = await screen.findByRole('switch', { name: 'Apply VAT by default' })
    fireEvent.click(toggle)
    expect(screen.getByLabelText('VAT rate (%)')).toHaveValue(20)
    view.conflict()
    next()
    expect(await screen.findByRole('alert')).toHaveTextContent('changed in another tab')
    expect(screen.getByRole('switch', { name: 'Apply VAT by default' })).toHaveAttribute(
      'data-state',
      'checked',
    )
    expect(screen.getByRole('button', { name: 'Reload saved version' })).toBeInTheDocument()
  })
  it('does not restore owner data or navigate when a create finishes after logout', async () => {
    const { client, request, location } = setup()
    fireEvent.change(await screen.findByLabelText(/^Organization name/), {
      target: { value: 'Draft' },
    })
    let resolve!: (value: ReturnType<typeof response>) => void
    request.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    next()
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(expect.objectContaining({ method: 'POST' })),
    )
    client.removeQueries({ queryKey: getGetOwnerSessionQueryKey() })
    await act(async () => {
      resolve(response(initial(), 201))
      await new Promise((done) => setTimeout(done, 0))
    })
    expect(location.history.at(-1)).toBe('/owner/organizations/new')
    expect(
      client.getQueriesData({
        predicate: (query) => String(query.queryKey[0]).includes('/onboarding'),
      }),
    ).toEqual([])
  })

  it('warns before leaving unsaved company details and keeps editing on request', async () => {
    const { location } = setup(initial(2))
    fireEvent.change(await screen.findByLabelText(/^City/), { target: { value: 'Rabat' } })
    fireEvent.click(screen.getAllByRole('link', { name: 'Overview' })[0]!)
    expect(await screen.findByRole('dialog')).toHaveTextContent('Discard unsaved changes?')
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText(/^City/)).toHaveValue('Rabat')
    expect(location.history.at(-1)).toBe(`/owner/organizations/${id}/setup`)
  })
})
