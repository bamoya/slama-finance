import './translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { DeliveryAcknowledgmentDialog } from './delivery-notes/components/delivery-acknowledgment-dialog'
import { DeliveryNoteDetailPage } from './delivery-notes/pages/delivery-note-detail-page'
import { EstimateDetailPage } from './estimates/pages/estimate-detail-page'
import { InvoiceDetailPage } from './invoices/pages/invoice-detail-page'

const mocks = vi.hoisted(() => ({
  cancelInvoice: vi.fn(),
  cancelEstimate: vi.fn(),
  cancelDelivery: vi.fn(),
}))

const id = '11111111-1111-4111-8111-111111111111'
const common = {
  id,
  number: 'DOC-26-001',
  clientId: '22222222-2222-4222-8222-222222222222',
  clientDisplayName: 'Atlas Market',
  status: 'issued',
  version: 4,
  createdAt: '2026-09-30T10:00:00Z',
  issueDate: '2026-09-30',
  currency: 'MAD',
  subtotal: '100.00',
  taxTotal: '0.00',
  total: '100.00',
  lines: [],
}

vi.mock('../identity', () => ({
  Can: ({ children }: { children: ReactNode }) => children,
  useAuthorization: () => ({ can: () => true }),
}))
vi.mock('./invoices/queries', () => ({
  useInvoice: () => ({
    data: { ...common, deliveryNoteIds: [] },
    isPending: false,
    isError: false,
  }),
  useInvoiceArtifacts: () => ({ data: [] }),
  useInvoiceActions: () => ({ cancel: mocks.cancelInvoice }),
  useEstimateInvoices: () => ({ data: [] }),
  refreshInvoices: vi.fn(),
}))
vi.mock('./estimates/queries', () => ({
  useEstimate: () => ({ data: common, isPending: false, isError: false }),
  useEstimateArtifacts: () => ({ data: [] }),
  useEstimateActions: () => ({ cancel: mocks.cancelEstimate }),
  refreshEstimates: vi.fn(),
}))
vi.mock('./delivery-notes/queries', () => ({
  useDeliveryNote: () => ({
    data: {
      ...common,
      status: 'prepared',
      deliveryDate: '2026-10-01',
      deliveryAddress: 'Casablanca',
      invoices: [],
    },
    isPending: false,
    isError: false,
  }),
  useDeliveryArtifacts: () => ({ data: [] }),
  useDeliveryActions: () => ({ cancel: mocks.cancelDelivery }),
  refreshDeliveries: vi.fn(),
}))
vi.mock('./invoices/components/invoice-payment-history', () => ({
  InvoicePaymentHistory: () => null,
}))
vi.mock('./invoices/components/invoice-relationships', () => ({
  InvoiceRelationships: () => null,
}))
vi.mock('./payments/components/invoice-balance', () => ({ InvoiceBalance: () => null }))

function setup(path: string, node: ReactNode) {
  const route = path.startsWith('/delivery-notes')
    ? '/delivery-notes/:noteId'
    : path.startsWith('/estimates')
      ? '/estimates/:documentId'
      : '/invoices/:documentId'
  render(
    <QueryClientProvider client={new QueryClient()}>
      <Router hook={memoryLocation({ path }).hook}>
        <Route path={route}>{node}</Route>
      </Router>
    </QueryClientProvider>,
  )
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
  mocks.cancelInvoice.mockResolvedValue(undefined)
  mocks.cancelEstimate.mockResolvedValue(undefined)
  mocks.cancelDelivery.mockResolvedValue(undefined)
})

describe('sales document cancellation dialogs', () => {
  it.each([
    ['invoice', '/invoices', <InvoiceDetailPage />, mocks.cancelInvoice],
    ['estimate', '/estimates', <EstimateDetailPage />, mocks.cancelEstimate],
    ['delivery note', '/delivery-notes', <DeliveryNoteDetailPage />, mocks.cancelDelivery],
  ])('shows %s reason only after opening the dialog', async (name, path, page, cancel) => {
    setup(`${path}/${id}`, page)
    expect(screen.queryByRole('textbox', { name: 'Cancellation reason' })).not.toBeInTheDocument()
    await openMore()
    fireEvent.click(screen.getByRole('menuitem', { name: `Cancel ${name}` }))
    const dialog = await screen.findByRole('dialog')
    expect(cancel).not.toHaveBeenCalled()
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Cancellation reason' }), {
      target: { value: 'Customer requested cancellation' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() =>
      expect(cancel).toHaveBeenCalledWith(id, 4, 'Customer requested cancellation'),
    )
  })

  it('returns focus to the delivery acknowledgment trigger when dismissed', async () => {
    const confirm = vi.fn()
    setup(
      `/delivery-notes/${id}`,
      <DeliveryAcknowledgmentDialog expectedVersion={4} onConfirm={confirm} />,
    )
    const trigger = screen.getByRole('button', { name: 'Acknowledge delivery' })
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(trigger).toHaveFocus())
    expect(confirm).not.toHaveBeenCalled()
  })
})
