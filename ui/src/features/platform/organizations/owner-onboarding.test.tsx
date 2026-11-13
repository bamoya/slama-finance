import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { getGetOwnerSessionQueryKey } from '../../../api/generated/identity/identity'
import type { OwnerOnboarding, SaveOwnerOnboarding } from '../../../api/generated/models'
import { httpClient } from '../../../api/http'
import { ownerRoutes } from '../../../app/router/owner-routes'

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
function setup(start?: OwnerOnboarding, createFailure?: { status: number; body: unknown }) {
  let stored = start
  let conflict = false
  const request = vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
    if (config.url === '/api/v1/owner-auth/session') return response({ owner })
    if (config.url === '/api/v1/owner/legal-type-requirements')
      return response({
        items: [
          {
            legalType: 'auto_entrepreneur',
            fields: [
              { field: 'legalName', requiredForLegalInvoice: true },
              { field: 'ice', requiredForLegalInvoice: true },
              { field: 'addressLine1', requiredForLegalInvoice: true },
              { field: 'city', requiredForLegalInvoice: true },
              { field: 'professionalTaxNumber', requiredForLegalInvoice: false },
            ],
          },
          {
            legalType: 'sarl',
            fields: [
              'legalName',
              'ice',
              'taxIdentifier',
              'registrationNumber',
              'professionalTaxNumber',
              'shareCapital',
              'addressLine1',
              'city',
            ].map((field) => ({ field, requiredForLegalInvoice: true })),
          },
        ],
      })
    if (config.url === '/api/v1/owner/organization-slugs/availability') {
      const slug = (config.params as { slug: string }).slug
      const reason = slug === 'taken-shop' ? 'taken' : slug === 'www' ? 'reserved' : null
      return response({ slug, available: !reason, reason })
    }
    if (config.url === '/api/v1/owner/organizations' && config.method === 'POST') {
      if (createFailure) return response(createFailure.body, createFailure.status)
      const body = config.data as { name: string; requestId: string }
      stored = initial()
      stored.organization.id = body.requestId
      stored.organization.name = body.name
      stored.configuration.name = body.name
      return response(stored, 201)
    }
    if (config.url === '/api/v1/owner/organizations')
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
    path: start ? `/organizations/${id}/setup` : '/organizations/new',
    record: true,
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <Switch>{ownerRoutes}</Switch>
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

describe('Organization address', () => {
  const address = () => screen.getByLabelText(/^Organization address/)
  const name = async (value: string) =>
    fireEvent.change(await screen.findByLabelText(/^Organization name/), { target: { value } })

  it('suggests an address from the name and formats typing live', async () => {
    setup()
    await name('Café  Étoile_du Sud!')
    expect(address()).toHaveValue('cafe-etoile-du-sud')
    fireEvent.change(address(), { target: { value: '--Mon  Shop__2--Rabat' } })
    expect(address()).toHaveValue('mon-shop-2-rabat')
    expect(
      screen.getByText(
        new RegExp(`${window.location.protocol}//mon-shop-2-rabat\\.localhost:3000`),
      ),
    ).toBeInTheDocument()
    fireEvent.change(address(), { target: { value: 'edited' } })
    await name('Another name')
    expect(address()).toHaveValue('edited')
  })

  it('checks availability after a pause and blocks continuing until available', async () => {
    const { request } = setup()
    await name('Taken Shop')
    expect(screen.getByText('Checking availability…')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(await screen.findByText('This address is already taken.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    fireEvent.change(address(), { target: { value: 'www' } })
    expect(await screen.findByText(/is reserved/)).toBeInTheDocument()
    fireEvent.change(address(), { target: { value: 'ab' } })
    expect(screen.getByText(/Use 3 to 40 letters/)).toBeInTheDocument()
    fireEvent.change(address(), { target: { value: 'free-shop' } })
    expect(await screen.findByText('This address is available.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    const checks = request.mock.calls.filter(([c]) => c.url?.includes('slugs'))
    expect(checks.map(([c]) => (c.params as { slug: string }).slug)).toEqual([
      'taken-shop',
      'www',
      'free-shop',
    ])
  })

  it('shows a lost race on submit as an address error', async () => {
    setup(undefined, { status: 409, body: { code: 'SLUG_TAKEN', message: 'taken' } })
    await name('Maison Atlas')
    await screen.findByText('This address is available.')
    next()
    expect(await screen.findByText('This address is already taken.')).toHaveAttribute(
      'role',
      'alert',
    )
    expect(address()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('heading', { name: 'Company identity' })).not.toBeInTheDocument()
  })
})

describe('Guided owner organization onboarding', () => {
  it('creates a real draft, accepts empty optional company data and completes all six steps', async () => {
    const { location, stored, request } = setup()
    fireEvent.change(await screen.findByLabelText(/^Organization name/), {
      target: { value: 'Maison Atlas' },
    })
    expect(screen.getByLabelText(/^Organization address/)).toHaveValue('maison-atlas')
    await screen.findByText('This address is available.')
    next()
    await screen.findByRole('heading', { name: 'Company identity' })
    expect(location.history.at(-1)).toMatch(/\/organizations\/[a-f0-9-]+\/setup$/)
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
  it('shows only the fields of the chosen legal type and marks the required ones', async () => {
    const { stored } = setup(initial(2))
    expect(await screen.findByText(/you issue simple invoices/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^ICE/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Legal company name/)).toBeInTheDocument()
    const type = screen.getByRole('combobox', { name: /Legal type/ })
    fireEvent.click(type)
    fireEvent.click(await screen.findByRole('option', { name: 'Auto-entrepreneur' }))
    expect(await screen.findByLabelText(/^ICE/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Commercial register/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Share capital/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^Professional tax/).closest('label')).toHaveTextContent(
      'Optional',
    )
    expect(screen.getByLabelText(/^ICE/).closest('label')).toHaveTextContent(
      'Required for legal invoices',
    )
    fireEvent.click(screen.getByRole('combobox', { name: /Legal type/ }))
    fireEvent.click(await screen.findByRole('option', { name: 'SARL' }))
    expect(await screen.findByLabelText(/^Share capital/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Commercial register/)).toBeInTheDocument()
    expect(screen.getByText(/This never blocks you/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save & exit' }))
    await waitFor(() => expect(stored()!.configuration.company.legalType).toBe('sarl'))
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
    await waitFor(() => expect(location.history.at(-1)).toBe('/organizations'))
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
    await screen.findByText('This address is available.')
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
    expect(location.history.at(-1)).toBe('/organizations/new')
    expect(
      client.getQueriesData({
        predicate: (query) => String(query.queryKey[0]).includes('/onboarding'),
      }),
    ).toEqual([])
  })

  it('warns before leaving unsaved company details and keeps editing on request', async () => {
    window.history.replaceState({}, '', `/organizations/${id}/setup`)
    const { location } = setup(initial(2))
    fireEvent.change(await screen.findByLabelText(/^City/), { target: { value: 'Rabat' } })
    fireEvent.click(screen.getAllByRole('link', { name: 'Overview' })[0]!)
    expect(await screen.findByRole('dialog')).toHaveTextContent('Discard unsaved changes?')
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByLabelText(/^City/)).toHaveValue('Rabat')
    expect(location.history.at(-1)).toBe(`/organizations/${id}/setup`)
  })
})
