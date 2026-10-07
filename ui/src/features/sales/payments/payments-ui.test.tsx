import '../translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { Invoice, Payment } from '../../../api/generated/models'
import { EstimatesPage } from '../estimates/pages/estimates-page'
import { PaymentActions } from './components/payment-actions'
import { PaymentCreatePage } from './pages/payment-create-page'

const mocks = vi.hoisted(() => ({
  permissions: new Set<string>(),
  useInvoices: vi.fn(),
  useInvoice: vi.fn(),
  useEstimates: vi.fn(),
  useClients: vi.fn(),
  useClient: vi.fn(),
  useBankAccounts: vi.fn(),
  create: vi.fn(),
  confirm: vi.fn(),
  cancel: vi.fn(),
  restore: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('../../../features/identity', () => ({
  Can: ({
    permission,
    children,
    fallback = null,
  }: {
    permission: string | readonly string[]
    children: ReactNode
    fallback?: ReactNode
  }) =>
    (
      Array.isArray(permission)
        ? permission.every((key) => mocks.permissions.has(key))
        : mocks.permissions.has(permission as string)
    )
      ? children
      : fallback,
  useAuthorization: () => ({ can: (key: string) => mocks.permissions.has(key) }),
}))
vi.mock('../../../features/clients', () => ({
  useClients: mocks.useClients,
  useClient: mocks.useClient,
}))
vi.mock('../../../features/settings', () => ({ useBankAccounts: mocks.useBankAccounts }))
vi.mock('../invoices/queries', () => ({
  useInvoices: mocks.useInvoices,
  useInvoice: mocks.useInvoice,
}))
vi.mock('../estimates/queries', () => ({ useEstimates: mocks.useEstimates }))
vi.mock('./queries', () => ({
  usePaymentActions: () => ({
    create: mocks.create,
    confirm: mocks.confirm,
    cancel: mocks.cancel,
    restore: mocks.restore,
    delete: mocks.delete,
  }),
  refreshPayments: vi.fn(),
}))

const invoiceId = '11111111-1111-4111-8111-111111111111'
const paymentId = '22222222-2222-4222-8222-222222222222'
const invoice = {
  id: invoiceId,
  clientId: '33333333-3333-4333-8333-333333333333',
  clientDisplayName: 'Atlas Market',
  number: 'INV-26-001',
  status: 'issued',
  availableBalance: '75.00',
  currency: 'MAD',
} as Invoice
const payment = {
  id: paymentId,
  invoiceId,
  status: 'pending',
  method: 'cheque',
  paymentDate: '2026-09-28',
  version: 3,
} as Payment

function setup(node: ReactNode, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const location = memoryLocation({ path, record: true })
  const route = path.startsWith('/estimates')
    ? '/estimates'
    : path.startsWith('/payments/new')
      ? '/payments/new'
      : '/payments/:paymentId'
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <Route path={route}>{node}</Route>
      </Router>
    </QueryClientProvider>,
  )
  return { client, location }
}

async function openMore() {
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'More' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined },
  })
  vi.clearAllMocks()
  mocks.permissions.clear()
  mocks.permissions.add('invoices.read')
  mocks.permissions.add('payments.create')
  mocks.permissions.add('payments.update')
  mocks.permissions.add('payments.update')
  mocks.permissions.add('clients.read')
  mocks.useInvoice.mockReturnValue({ data: invoice, isPending: false, isError: false })
  mocks.useInvoices.mockReturnValue({
    data: { items: [invoice], total: 1 },
    isPending: false,
    isError: false,
  })
  mocks.useEstimates.mockReturnValue({
    data: { items: [], total: 0 },
    isPending: false,
    isError: false,
  })
  mocks.useClients.mockReturnValue({ data: { items: [] }, isPending: false, isError: false })
  mocks.useClient.mockReturnValue({ data: undefined, isPending: false, isError: false })
  mocks.useBankAccounts.mockReturnValue({ data: [], isPending: false, isError: false })
  mocks.create.mockResolvedValue({ id: paymentId })
  mocks.confirm.mockResolvedValue({ ...payment, status: 'confirmed' })
  mocks.cancel.mockResolvedValue({ ...payment, status: 'cancelled' })
  mocks.restore.mockResolvedValue({ ...payment, status: 'pending' })
  mocks.delete.mockResolvedValue(undefined)
})

describe('sales payment screens', () => {
  it('creates an immediately confirmed cash payment for the prefilled invoice', async () => {
    setup(<PaymentCreatePage />, `/payments/new?invoiceId=${invoiceId}`)
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '25.00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledOnce())
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId,
        amount: '25.00',
        currency: 'MAD',
        method: 'cash',
        status: 'confirmed',
      }),
    )
    const payload = mocks.create.mock.calls[0]![0]
    expect(payload.collectedOn).toBe(payload.paymentDate)
    expect(payload.operationId).toMatch(/^[0-9a-f-]{36}$/i)
  })

  it('keeps cheques pending and checks the reserved invoice balance', async () => {
    setup(<PaymentCreatePage />, `/payments/new?invoiceId=${invoiceId}`)
    fireEvent.change(screen.getByRole('spinbutton', { name: /Amount/ }), {
      target: { value: '80.00' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Amount exceeds the available invoice balance.',
    )
    expect(mocks.create).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('spinbutton', { name: /Amount/ }), {
      target: { value: '20.00' },
    })
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Method' }), { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: 'Cheque' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Cheque bank' }), {
      target: { value: 'Atlas Bank' },
    })
    fireEvent.change(screen.getByRole('textbox', { name: 'Cheque number' }), {
      target: { value: 'CH-204' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save payment' }))
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'cheque',
          status: 'pending',
          chequeBank: 'Atlas Bank',
          chequeNumber: 'CH-204',
          collectedOn: null,
        }),
      ),
    )
  })

  it('keeps cancellation reason in the dialog and sends the current version', async () => {
    setup(<PaymentActions payment={payment} />, `/payments/${paymentId}`)
    expect(screen.queryByRole('textbox', { name: 'Cancellation reason' })).not.toBeInTheDocument()
    await openMore()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel payment' }))
    expect(mocks.cancel).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm cancellation' }))
    expect(mocks.cancel).not.toHaveBeenCalled()
    expect(within(dialog).getByText('Enter a valid cancellation reason.')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Cancellation reason' }), {
      target: { value: 'Cheque returned' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() =>
      expect(mocks.cancel).toHaveBeenCalledWith(paymentId, {
        expectedVersion: 3,
        reason: 'Cheque returned',
      }),
    )
  })

  it('hides deletion after a receipt has been issued but retains cancellation', async () => {
    setup(
      <PaymentActions payment={{ ...payment, receiptIssuedAt: '2026-10-02T10:00:00Z' }} />,
      `/payments/${paymentId}`,
    )
    await openMore()
    expect(screen.queryByRole('menuitem', { name: 'Delete payment' })).not.toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Cancel payment' })).toBeInTheDocument()
  })

  it('restores a cancelled payment through a confirmation dialog', async () => {
    mocks.permissions.add('payments.update')
    setup(
      <PaymentActions payment={{ ...payment, status: 'cancelled' }} />,
      `/payments/${paymentId}`,
    )
    await openMore()
    expect(screen.queryByRole('menuitem', { name: 'Cancel payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete payment' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Restore payment' }))
    expect(mocks.restore).not.toHaveBeenCalled()
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }),
    )
    await waitFor(() =>
      expect(mocks.restore).toHaveBeenCalledWith(paymentId, { expectedVersion: 3 }),
    )
  })

  it('deletes a payment only after confirmation and returns to the list', async () => {
    mocks.permissions.add('payments.delete')
    const { location } = setup(<PaymentActions payment={payment} />, `/payments/${paymentId}`)
    await openMore()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete payment' }))
    expect(mocks.delete).not.toHaveBeenCalled()
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Confirm' }),
    )
    await waitFor(() =>
      expect(mocks.delete).toHaveBeenCalledWith(paymentId, { expectedVersion: 3 }),
    )
    await waitFor(() => expect(location.history.at(-1)).toBe('/payments'))
  })

  it('confirms a pending payment with its current version', async () => {
    setup(<PaymentActions payment={payment} />, `/payments/${paymentId}`)
    expect(screen.queryByRole('button', { name: 'Restore payment' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete payment' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm payment' }))
    const dialog = await screen.findByRole('dialog')
    expect(mocks.confirm).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm payment' }))
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledOnce())
    expect(mocks.confirm.mock.calls[0]![0]).toBe(paymentId)
    expect(mocks.confirm.mock.calls[0]![1]).toEqual(expect.objectContaining({ expectedVersion: 3 }))
  })

  it('returns focus to the payment confirmation trigger when dismissed', async () => {
    setup(<PaymentActions payment={payment} />, `/payments/${paymentId}`)
    const trigger = screen.getByRole('button', { name: 'Confirm payment' })
    fireEvent.click(trigger)
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(mocks.confirm).not.toHaveBeenCalled()
  })

  it('moves search into the URL and resets the document page', async () => {
    const { location } = setup(<EstimatesPage />, '/estimates?page=2')
    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Search number, client or reference' }),
      { target: { value: 'Atlas' } },
    )
    await waitFor(() =>
      expect(mocks.useEstimates).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'Atlas', page: 1, pageSize: 25 }),
      ),
    )
    expect(location.history.at(-1)).toContain('search=Atlas')
    expect(location.history.at(-1)).not.toContain('page=2')
  })

  it('searches clients inside the document filter and preserves the selected name', async () => {
    const clientId = invoice.clientId
    mocks.useClients.mockReturnValue({
      data: { items: [{ id: clientId, displayName: 'Atlas Market' }] },
      isPending: false,
      isError: false,
    })
    mocks.useClient.mockReturnValue({
      data: { id: clientId, displayName: 'Atlas Market' },
      isPending: false,
      isError: false,
    })
    const { location } = setup(<EstimatesPage />, '/estimates')
    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search options' }), {
      target: { value: 'Atlas' },
    })
    await waitFor(() =>
      expect(mocks.useClients).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'Atlas' }),
        true,
      ),
    )
    fireEvent.click(screen.getByRole('option', { name: 'Atlas Market' }))
    await waitFor(() => expect(location.history.at(-1)).toContain(`clientId=${clientId}`))
    expect(screen.getByRole('combobox', { name: 'Client' })).toHaveTextContent('Atlas Market')
  })

  it('searches payable invoices inside the payment picker', async () => {
    setup(<PaymentCreatePage />, `/payments/new?invoiceId=${invoiceId}`)
    fireEvent.click(screen.getByRole('combobox', { name: 'Select invoice' }))
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search options' }), {
      target: { value: 'INV-26' },
    })
    await waitFor(() =>
      expect(mocks.useInvoices).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: 'INV-26' }),
        true,
      ),
    )
    expect(screen.getByRole('combobox', { name: 'Select invoice' })).toHaveTextContent('INV-26-001')
  })
})
