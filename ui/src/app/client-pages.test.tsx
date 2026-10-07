import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type * as GeneratedApi from '../api/generated/clients/clients'
import type * as SalesApi from '../api/generated/sales/sales'
import type { Client } from '../api/generated/schemas/clients/clients.schemas'
import { apiRequest } from '../api/http'
import { ClientDetailPage, ClientFormPage, ClientsPage } from '../features/clients'
import * as auth from '../features/identity/auth/api/auth-client'
import { routeApiRequest } from '../test/api-transport'

vi.mock('../api/http', () => ({ apiRequest: vi.fn() }))
vi.mock('../features/identity/auth/api/auth-client', () => ({ getSession: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const stamp = '2026-09-27T00:00:00.000Z'
const client: Client = {
  id,
  displayName: 'Atlas SARL',
  type: 'company',
  firstName: null,
  lastName: null,
  legalName: 'Atlas SARL',
  tradeName: null,
  contactName: null,
  email: null,
  phone: null,
  ice: '000123456789012',
  taxIdentifier: null,
  registrationNumber: null,
  registrationCity: null,
  professionalTaxNumber: null,
  addressLine1: '12 Rue Atlas',
  addressLine2: null,
  city: 'Rabat',
  postalCode: null,
  countryCode: 'MA',
  deliveryAddressLine1: null,
  deliveryAddressLine2: null,
  deliveryCity: null,
  deliveryPostalCode: null,
  deliveryCountryCode: null,
  locale: 'fr-MA',
  notes: null,
  archivedAt: null,
  version: 1,
  createdAt: stamp,
  updatedAt: stamp,
  createdByUserId: null,
  updatedByUserId: null,
}
const api = {
  listClients: vi.fn<typeof GeneratedApi.listClients>(),
  getClient: vi.fn<typeof GeneratedApi.getClient>(),
  getClientOverview: vi.fn<typeof GeneratedApi.getClientOverview>(),
  listInvoices: vi.fn<typeof SalesApi.listInvoices>(),
  listEstimates: vi.fn<typeof SalesApi.listEstimates>(),
  listDeliveryNotes: vi.fn<typeof SalesApi.listDeliveryNotes>(),
  listPayments: vi.fn<typeof SalesApi.listPayments>(),
  createClient: vi.fn<typeof GeneratedApi.createClient>(),
  updateClient: vi.fn<typeof GeneratedApi.updateClient>(),
  archiveClient: vi.fn<typeof GeneratedApi.archiveClient>(),
  restoreClient: vi.fn<typeof GeneratedApi.restoreClient>(),
  deleteClient: vi.fn<typeof GeneratedApi.deleteClient>(),
}
const caches: QueryClient[] = []
function visit(path: string) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  caches.push(cache)
  const location = memoryLocation({ path, record: true })
  render(
    <QueryClientProvider client={cache}>
      <Router hook={location.hook}>
        <Route path="/clients/new">
          <ClientFormPage />
        </Route>
        <Route path="/clients/:clientId/edit">
          <ClientFormPage />
        </Route>
        <Route path="/clients/:clientId">
          <ClientDetailPage />
        </Route>
        <Route path="/clients">
          <ClientsPage />
        </Route>
      </Router>
    </QueryClientProvider>,
  )
  return location
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.mocked(apiRequest).mockImplementation(routeApiRequest(api) as typeof apiRequest)
  vi.mocked(auth.getSession).mockResolvedValue({
    user: {
      id,
      email: 'admin@example.test',
      firstName: 'Admin',
      lastName: 'User',
      avatarUrl: null,
    },
    purpose: 'full',
    permissionKeys: [
      'clients.read',
      'clients.create',
      'clients.update',
      'clients.update',
      'clients.update',
      'clients.delete',
    ],
  })
  api.listClients.mockResolvedValue({
    items: [client],
    total: 1,
    limit: 25,
    offset: 0,
    financialCurrency: 'MAD',
  })
  api.getClient.mockResolvedValue(client)
  api.getClientOverview.mockResolvedValue({
    client,
    financialSummary: {
      currencies: [
        {
          currency: 'MAD',
          invoicedAmount: '1000.00',
          receivedAmount: '250.00',
          outstandingAmount: '750.00',
          overdueAmount: '500.00',
        },
      ],
    },
    recentActivity: [
      {
        id,
        type: 'invoice',
        number: 'INV-2026-1234567890',
        status: 'issued',
        date: stamp,
        amount: '1000.00',
        currency: 'MAD',
      },
    ],
  })
  for (const list of [api.listInvoices, api.listEstimates, api.listDeliveryNotes, api.listPayments])
    list.mockResolvedValue({ items: [], total: 0, limit: 10, offset: 0 })
})
afterEach(() => {
  caches.splice(0).forEach((cache) => cache.clear())
})

describe('API-integrated client pages', () => {
  it('archives selected clients through the generated API with version checks', async () => {
    api.archiveClient.mockResolvedValue({ ...client, archivedAt: stamp, version: 2 })
    visit('/clients')
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Atlas SARL' }))
    const toolbar = screen.getByRole('group', { name: '1 selected on this page' })
    fireEvent.click(within(toolbar).getByRole('button', { name: 'Archive' }))
    expect(api.archiveClient).not.toHaveBeenCalled()
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))
    await screen.findByText('1 succeeded · 0 skipped · 0 failed')
    expect(api.archiveClient).toHaveBeenCalledWith(id, { expectedVersion: 1 })
    expect(screen.getByRole('checkbox', { name: 'Select Atlas SARL' })).not.toBeChecked()
  })
  it('opens the tree from the URL, retains filters on switching, and only loads permitted domains', async () => {
    const session = (await auth.getSession())!
    vi.mocked(auth.getSession).mockResolvedValue({
      ...session,
      permissionKeys: [...session.permissionKeys, 'invoices.read', 'payments.read'],
    })
    visit(`/clients/${id}?recordsView=tree&recordsSearch=FAC&recordsInvoiceStatus=cancelled`)
    expect(
      await screen.findByText(
        'Expand a record to follow its invoices, deliveries and payments. Standalone records remain at the top level. Filters keep matching records and their parent context. Amounts are not added across branches.',
      ),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(api.listPayments).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: id, limit: 100 }),
      ),
    )
    expect(api.listEstimates).not.toHaveBeenCalled()
    expect(api.listDeliveryNotes).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('radio', { name: 'Table' }))
    expect(screen.getByRole('combobox', { name: 'Invoice status' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Payment status' })).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search document number…')).toHaveValue('FAC')
    await waitFor(() =>
      expect(api.listInvoices).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: id, limit: 10, search: 'FAC', status: 'cancelled' }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }))
    expect(screen.getByRole('combobox', { name: 'Payment status' })).toHaveTextContent(
      'Payment status',
    )
    expect(screen.queryByRole('combobox', { name: 'Invoice status' })).not.toBeInTheDocument()
    await waitFor(() =>
      expect(api.listPayments).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: id, limit: 10, status: undefined }),
      ),
    )
    fireEvent.click(screen.getByRole('radio', { name: 'Tree' }))
    expect(screen.getByRole('combobox', { name: 'Invoice status' })).toHaveTextContent('Cancelled')
    expect(screen.getByRole('combobox', { name: 'Payment status' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Estimate status' })).not.toBeInTheDocument()
  })
  it('shows currency-specific totals and switches related records through generated queries', async () => {
    const session = (await auth.getSession())!
    vi.mocked(auth.getSession).mockResolvedValue({
      ...session,
      permissionKeys: [
        ...session.permissionKeys,
        'invoices.read',
        'invoices.create',
        'payments.read',
        'estimates.read',
      ],
    })
    visit(`/clients/${id}`)
    expect(await screen.findByText('Outstanding')).toBeInTheDocument()
    expect(screen.getByText('750.00')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create invoice' })).toHaveAttribute(
      'href',
      `/invoices/new?clientId=${id}`,
    )
    const related = screen.getByRole('region', { name: 'Related records' })
    expect(related.contains(screen.getByRole('link', { name: 'Create invoice' }))).toBe(true)
    expect(
      screen.getByRole('heading', { name: 'Billing identity' }).compareDocumentPosition(related) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Estimates' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Invoices' }))
    await waitFor(() =>
      expect(api.listInvoices).toHaveBeenCalledWith(
        expect.objectContaining({ clientId: id, limit: 10, offset: 0 }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Payments' }))
    await waitFor(() =>
      expect(api.listPayments).toHaveBeenCalledWith(expect.objectContaining({ clientId: id })),
    )
    expect(api.listDeliveryNotes).not.toHaveBeenCalled()
  })
  it('does not request sales data or render financial filters for client-only staff', async () => {
    visit(`/clients/${id}`)
    await screen.findByText('Billing identity')
    expect(api.getClientOverview).not.toHaveBeenCalled()
    expect(api.listInvoices).not.toHaveBeenCalled()
    expect(screen.queryByText('Outstanding')).not.toBeInTheDocument()
  })
  it('uses URL city and sorting filters and drops restricted finance criteria', async () => {
    visit('/clients?city=Rabat&sortBy=createdAt&sortOrder=desc&balanceMin=100')
    await screen.findByRole('link', { name: 'Atlas SARL' })
    expect(api.listClients).toHaveBeenLastCalledWith(
      expect.objectContaining({ city: 'Rabat', sortBy: 'createdAt', sortOrder: 'desc' }),
    )
    expect(api.listClients.mock.calls.at(-1)?.[0]).not.toHaveProperty('balanceMin')
    fireEvent.change(screen.getByPlaceholderText('Filter by city'), {
      target: { value: 'Casablanca' },
    })
    await waitFor(() =>
      expect(api.listClients).toHaveBeenLastCalledWith(
        expect.objectContaining({ city: 'Casablanca', offset: 0 }),
      ),
    )
  })
  it('lists real client data without invented financial totals', async () => {
    visit('/clients')
    expect(await screen.findByRole('link', { name: 'Atlas SARL' })).toBeInTheDocument()
    expect(screen.queryByText('Outstanding')).not.toBeInTheDocument()
    expect(api.listClients).toHaveBeenCalled()
  })
  it('creates an individual with optional email and a complete billing address', async () => {
    api.createClient.mockResolvedValue({
      ...client,
      type: 'individual',
      firstName: 'Sara',
      lastName: 'Amrani',
      legalName: null,
      ice: null,
      displayName: 'Sara Amrani',
    })
    const location = visit('/clients/new')
    fireEvent.click(screen.getByRole('combobox', { name: 'Client type' }))
    fireEvent.click(await screen.findByRole('option', { name: 'Individual' }))
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Sara' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Amrani' } })
    fireEvent.change(screen.getByLabelText('Address line 1'), { target: { value: '12 Rue Atlas' } })
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Rabat' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create client' }))
    await waitFor(() =>
      expect(api.createClient).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'individual',
          firstName: 'Sara',
          lastName: 'Amrani',
          email: null,
        }),
      ),
    )
    await waitFor(() => expect(location.history.at(-1)).toBe(`/clients/${id}`))
  })
  it('shows archived client detail without fake document history', async () => {
    api.getClient.mockResolvedValue({ ...client, archivedAt: stamp })
    visit(`/clients/${id}`)
    expect(await screen.findByText('Billing identity')).toBeInTheDocument()
    expect(screen.getByText('Archived')).toBeInTheDocument()
    expect(screen.queryByText('Recent documents')).not.toBeInTheDocument()
  })
  it('confirms a client deletion before calling the generated API', async () => {
    api.deleteClient.mockResolvedValue(undefined)
    const location = visit(`/clients/${id}`)
    await screen.findByText('Billing identity')
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'More' }), {
      button: 0,
      ctrlKey: false,
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/only unreferenced clients/i)).toBeInTheDocument()
    expect(api.deleteClient).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(api.deleteClient).toHaveBeenCalledWith(id, { expectedVersion: 1 }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/clients'))
  })
})
