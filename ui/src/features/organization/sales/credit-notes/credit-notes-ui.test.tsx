import './translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { ApiError } from '../../../../lib/api-error'
import { InvoiceDetailPage } from '../invoices/pages/invoice-detail-page'
import { CreditNoteDetailPage } from './pages/credit-note-detail-page'
import { CreditNoteFormPage } from './pages/credit-note-form-page'
import { CreditNotesPage } from './pages/credit-notes-page'

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  getInvoice: vi.fn(),
  listInvoiceArtifacts: vi.fn(),
  listInvoiceCreditNotes: vi.fn(),
  listPayments: vi.fn(),
  listCreditNotes: vi.fn(),
  getCreditNote: vi.fn(),
  getInvoiceCreditableLines: vi.fn(),
  listCreditNoteArtifacts: vi.fn(),
  createCreditNote: vi.fn(),
  updateCreditNote: vi.fn(),
  issueCreditNote: vi.fn(),
  deleteCreditNote: vi.fn(),
  prepareCreditNotePdf: vi.fn(),
}))
vi.mock('../../../../api/http', async () => {
  const { routeApiRequest } = await import('../../../../test/api-transport')
  return {
    apiRequest: routeApiRequest({
      getInvoice: state.getInvoice,
      listInvoiceArtifacts: state.listInvoiceArtifacts,
      listInvoiceCreditNotes: state.listInvoiceCreditNotes,
      listPayments: state.listPayments,
      listCreditNotes: state.listCreditNotes,
      getCreditNote: state.getCreditNote,
      getInvoiceCreditableLines: state.getInvoiceCreditableLines,
      listCreditNoteArtifacts: state.listCreditNoteArtifacts,
      createCreditNote: state.createCreditNote,
      updateCreditNote: state.updateCreditNote,
      issueCreditNote: state.issueCreditNote,
      deleteCreditNote: state.deleteCreditNote,
      prepareCreditNotePdf: state.prepareCreditNotePdf,
    }),
  }
})
vi.mock('../../identity', () => ({
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
        ? permission.every((key) => state.permissions.has(key))
        : state.permissions.has(permission as string)
    )
      ? children
      : fallback,
  useAuthorization: () => ({ can: (key: string) => state.permissions.has(key) }),
}))

const invoiceId = '11111111-1111-4111-8111-111111111111'
const lineId = '22222222-2222-4222-8222-222222222222'
const noteId = '33333333-3333-4333-8333-333333333333'
const invoice = {
  id: invoiceId,
  number: 'FAC-2026-000001',
  status: 'issued',
  kind: 'legal',
  clientId: null,
  clientDisplayName: 'Atlas Market',
  templateId: null,
  deliveryNoteIds: [],
  deliveryNotes: [],
  sourceEstimateId: null,
  sourceEstimateNumber: null,
  currency: 'MAD',
  issueDate: '2026-11-01',
  dueDate: null,
  createdAt: '2026-11-01T10:00:00Z',
  version: 2,
  lines: [],
  subtotal: '100.00',
  taxTotal: '20.00',
  total: '120.00',
  paidAmount: '0.00',
  pendingAmount: '0.00',
  outstandingAmount: '120.00',
  availableBalance: '120.00',
  creditedAmount: '0.00',
  netAmount: '120.00',
  refundDueAmount: '0.00',
  creditableAmount: '120.00',
  creditNoteCount: 0,
  paymentStatus: 'unpaid',
}
const note = {
  id: noteId,
  number: null,
  status: 'draft',
  kind: 'legal',
  invoiceId,
  invoiceNumber: 'FAC-2026-000001',
  invoiceIssueDate: '2026-11-01',
  clientId: null,
  clientDisplayName: 'Atlas Market',
  currency: 'MAD',
  locale: 'fr-MA',
  reason: 'Returned goods',
  issueDate: null,
  issuedAt: null,
  subtotal: '100.00',
  taxTotal: '20.00',
  total: '120.00',
  version: 3,
  contentVersion: 1,
  createdAt: '2026-11-02T10:00:00Z',
  updatedAt: '2026-11-02T10:00:00Z',
  lines: [
    {
      id: '44444444-4444-4444-8444-444444444444',
      position: 1,
      invoiceLineId: lineId,
      productName: 'Argan oil',
      productReference: null,
      quantity: 2,
      unitPrice: '50.00',
      vatRate: '20.00',
      netAmount: '100.00',
      taxAmount: '20.00',
      totalAmount: '120.00',
    },
  ],
}
const creditable = {
  invoiceId,
  invoiceNumber: 'FAC-2026-000001',
  currency: 'MAD',
  creditable: true,
  creditedAmount: '0.00',
  remainingAmount: '120.00',
  lines: [
    {
      invoiceLineId: lineId,
      position: 1,
      productName: 'Argan oil',
      productReference: null,
      vatRate: '20.00',
      unitPrice: '50.00',
      quantity: 3,
      netAmount: '150.00',
      taxAmount: '30.00',
      totalAmount: '180.00',
      creditedQuantity: 0,
      creditedNetAmount: '0.00',
      creditedTaxAmount: '0.00',
      creditedTotalAmount: '0.00',
      remainingQuantity: 3,
      remainingNetAmount: '150.00',
      remainingTaxAmount: '30.00',
      remainingTotalAmount: '180.00',
    },
  ],
}

function setup(node: ReactNode, route: string, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const location = memoryLocation({ path, record: true })
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <Route path={route}>{node}</Route>
      </Router>
    </QueryClientProvider>,
  )
  return location
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.clearAllMocks()
  state.permissions = new Set(['invoices.read', 'credit_notes.read'])
  state.getInvoice.mockResolvedValue(invoice)
  state.listInvoiceArtifacts.mockResolvedValue([])
  state.listInvoiceCreditNotes.mockResolvedValue([])
  state.listPayments.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 })
  state.getCreditNote.mockResolvedValue(note)
  state.listCreditNotes.mockResolvedValue({ items: [note], total: 1, limit: 25, offset: 0 })
  state.getInvoiceCreditableLines.mockResolvedValue(creditable)
  state.listCreditNoteArtifacts.mockResolvedValue([])
  state.createCreditNote.mockResolvedValue({ ...note, id: noteId, version: 1 })
  state.issueCreditNote.mockResolvedValue({ ...note, status: 'issued' })
  state.deleteCreditNote.mockResolvedValue(undefined)
})

const invoicePage = () =>
  setup(<InvoiceDetailPage />, '/invoices/:documentId', `/invoices/${invoiceId}`)

describe('invoice detail credit note action', () => {
  const createLink = () => screen.queryByRole('link', { name: /Create credit note/ })
  it('links to the editor for a creditable issued invoice with the right grants', async () => {
    state.permissions.add('credit_notes.create')
    invoicePage()
    expect(await screen.findByRole('link', { name: /Create credit note/ })).toHaveAttribute(
      'href',
      `/credit-notes/new?invoiceId=${invoiceId}`,
    )
  })
  it('is hidden without credit_notes.create', async () => {
    invoicePage()
    await screen.findByText('Invoice balance')
    expect(createLink()).toBeNull()
  })
  it('is hidden without invoices.read', async () => {
    state.permissions = new Set(['credit_notes.create'])
    invoicePage()
    await screen.findByText('Invoice balance')
    expect(createLink()).toBeNull()
  })
  it.each(['draft', 'cancelled'])('is hidden for a %s invoice', async (status) => {
    state.permissions.add('credit_notes.create')
    state.getInvoice.mockResolvedValue({ ...invoice, status })
    invoicePage()
    await screen.findByText('Invoice balance')
    expect(createLink()).toBeNull()
    expect(state.getInvoiceCreditableLines).not.toHaveBeenCalled()
  })
  it('uses the creditable flag even when no monetary credit remains', async () => {
    state.permissions.add('credit_notes.create')
    state.getInvoice.mockResolvedValue({ ...invoice, creditableAmount: '0.00' })
    state.getInvoiceCreditableLines.mockResolvedValue({ ...creditable, remainingAmount: '0.00' })
    invoicePage()
    expect(await screen.findByRole('link', { name: /Create credit note/ })).toBeInTheDocument()
  })
  it('hides the action when the server reports no creditable lines', async () => {
    state.permissions.add('credit_notes.create')
    state.getInvoiceCreditableLines.mockResolvedValue({ ...creditable, creditable: false })
    invoicePage()
    await waitFor(() => expect(state.getInvoiceCreditableLines).toHaveBeenCalled())
    expect(createLink()).toBeNull()
  })
})

describe('invoice detail balance and credit notes', () => {
  it('shows credited, net, net due and a highlighted refund due', async () => {
    state.getInvoice.mockResolvedValue({
      ...invoice,
      paymentStatus: 'paid',
      creditedAmount: '120.00',
      netAmount: '0.00',
      paidAmount: '20.00',
      outstandingAmount: '0.00',
      refundDueAmount: '20.00',
      creditableAmount: '0.00',
    })
    invoicePage()
    const balance = (await screen.findByText('Invoice balance')).closest('section')!
    expect(within(balance).getByText('Credited amount')).toBeInTheDocument()
    expect(within(balance).getByText('Net amount')).toBeInTheDocument()
    expect(within(balance).getByText('Net due')).toBeInTheDocument()
    expect(within(balance).getByRole('status')).toHaveTextContent('Refund due to client: 20.00 MAD')
    expect(within(balance).getByRole('status')).toHaveTextContent('not automated')
  })
  it('omits credit rows and refund block when nothing is credited', async () => {
    invoicePage()
    const balance = (await screen.findByText('Invoice balance')).closest('section')!
    expect(within(balance).queryByText('Credited amount')).toBeNull()
    expect(within(balance).queryByRole('status')).toBeNull()
    expect(within(balance).getByText('Outstanding')).toBeInTheDocument()
  })
  it('renders the credited payment status', async () => {
    state.getInvoice.mockResolvedValue({ ...invoice, paymentStatus: 'credited' })
    invoicePage()
    const balance = (await screen.findByText('Invoice balance')).closest('section')!
    expect(within(balance).getByText('Credited')).toBeInTheDocument()
  })
  it('lists the invoice credit notes with links when credit_notes.read is granted', async () => {
    state.listInvoiceCreditNotes.mockResolvedValue([
      { ...note, number: 'AVO-2026-000001', status: 'issued' },
    ])
    invoicePage()
    expect(await screen.findByRole('link', { name: /AVO-2026-000001/ })).toHaveAttribute(
      'href',
      `/credit-notes/${noteId}`,
    )
  })
  it('hides the credit notes section without credit_notes.read', async () => {
    state.permissions = new Set(['invoices.read'])
    invoicePage()
    await screen.findByText('Invoice balance')
    expect(screen.queryByText('Credit notes')).toBeNull()
    expect(state.listInvoiceCreditNotes).not.toHaveBeenCalled()
  })
})

describe('credit note editor', () => {
  const editor = async () => {
    state.permissions.add('credit_notes.create')
    const location = setup(
      <CreditNoteFormPage />,
      '/credit-notes/new',
      `/credit-notes/new?invoiceId=${invoiceId}`,
    )
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Credit line Argan oil' }))
    return location
  }
  const reason = () =>
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'Returned goods' } })

  it('submits a quantity-mode line and previews HT, VAT and TTC', async () => {
    await editor()
    fireEvent.change(screen.getByLabelText('Quantity to credit for Argan oil'), {
      target: { value: '2' },
    })
    expect(screen.getByTestId('preview-net')).toHaveTextContent('100.00 MAD')
    expect(screen.getByTestId('preview-tax')).toHaveTextContent('20.00 MAD')
    expect(screen.getByTestId('preview-total')).toHaveTextContent('120.00 MAD')
    reason()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(state.createCreditNote).toHaveBeenCalledWith({
        invoiceId,
        reason: 'Returned goods',
        lines: [{ invoiceLineId: lineId, quantity: 2 }],
      }),
    )
    expect(state.issueCreditNote).not.toHaveBeenCalled()
  })
  it('saves and issues a free return when the remaining monetary amount is zero', async () => {
    state.getInvoiceCreditableLines.mockResolvedValue({
      ...creditable,
      remainingAmount: '0.00',
      lines: [
        {
          ...creditable.lines[0],
          unitPrice: '0.00',
          remainingNetAmount: '0.00',
          remainingTaxAmount: '0.00',
        },
      ],
    })
    await editor()
    fireEvent.change(screen.getByLabelText('Quantity to credit for Argan oil'), {
      target: { value: '1' },
    })
    expect(screen.getByTestId('preview-total')).toHaveTextContent('0.00 MAD')
    reason()
    fireEvent.click(screen.getByRole('button', { name: 'Save and issue' }))
    await waitFor(() =>
      expect(state.createCreditNote).toHaveBeenCalledWith({
        invoiceId,
        reason: 'Returned goods',
        lines: [{ invoiceLineId: lineId, quantity: 1 }],
      }),
    )
    await waitFor(() =>
      expect(state.issueCreditNote).toHaveBeenCalledWith(noteId, { expectedVersion: 1 }),
    )
  })
  it('submits an amount-mode line', async () => {
    await editor()
    fireEvent.click(screen.getByRole('radio', { name: 'Amount' }))
    fireEvent.change(screen.getByLabelText('Amount excl. VAT to credit for Argan oil'), {
      target: { value: '30.5' },
    })
    expect(screen.getByTestId('preview-tax')).toHaveTextContent('6.10 MAD')
    reason()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(state.createCreditNote).toHaveBeenCalledWith({
        invoiceId,
        reason: 'Returned goods',
        lines: [{ invoiceLineId: lineId, amount: '30.5' }],
      }),
    )
  })
  it('refuses a quantity above the remaining quantity without calling the API', async () => {
    await editor()
    fireEvent.change(screen.getByLabelText('Quantity to credit for Argan oil'), {
      target: { value: '4' },
    })
    reason()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(state.createCreditNote).not.toHaveBeenCalled()
  })
  it('requires a reason', async () => {
    await editor()
    fireEvent.change(screen.getByLabelText('Quantity to credit for Argan oil'), {
      target: { value: '1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByText('Enter the reason for this credit note.')).toBeInTheDocument()
    expect(state.createCreditNote).not.toHaveBeenCalled()
  })
  it('saves then issues with Save and issue', async () => {
    await editor()
    fireEvent.change(screen.getByLabelText('Quantity to credit for Argan oil'), {
      target: { value: '1' },
    })
    reason()
    fireEvent.click(screen.getByRole('button', { name: 'Save and issue' }))
    await waitFor(() =>
      expect(state.issueCreditNote).toHaveBeenCalledWith(noteId, { expectedVersion: 1 }),
    )
  })
  it.each([
    ['CREDIT_EXCEEDS_INVOICE', 'exceeds what remains creditable'],
    ['INVOICE_NOT_CREDITABLE', 'can no longer be credited'],
    ['INVALID_CREDIT_LINE', 'credited lines is invalid'],
    ['INVALID_STATUS', 'already issued'],
    ['STALE_VERSION', 'changed elsewhere'],
  ])('shows a translated message for %s', async (code, text) => {
    state.createCreditNote.mockRejectedValue(new ApiError(409, code, 'server text'))
    await editor()
    fireEvent.change(screen.getByLabelText('Quantity to credit for Argan oil'), {
      target: { value: '1' },
    })
    reason()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
  })
  it('edits an existing draft with its version', async () => {
    state.permissions.add('credit_notes.update')
    state.updateCreditNote.mockResolvedValue({ ...note, version: 4 })
    setup(
      <CreditNoteFormPage />,
      '/credit-notes/:creditNoteId/edit',
      `/credit-notes/${noteId}/edit`,
    )
    expect(await screen.findByRole('checkbox', { name: 'Credit line Argan oil' })).toBeChecked()
    expect(screen.getByLabelText('Quantity to credit for Argan oil')).toHaveValue(2)
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(state.updateCreditNote).toHaveBeenCalledWith(noteId, {
        expectedVersion: 3,
        reason: 'Returned goods',
        lines: [{ invoiceLineId: lineId, quantity: 2 }],
      }),
    )
  })
})

describe('credit notes list', () => {
  it('shows number, simple label, invoice link, client and total', async () => {
    state.listCreditNotes.mockResolvedValue({
      items: [
        {
          ...note,
          number: 'AVS-2026-000001',
          status: 'issued',
          kind: 'simple',
          issueDate: '2026-11-03',
        },
        note,
      ],
      total: 2,
      limit: 25,
      offset: 0,
    })
    setup(<CreditNotesPage />, '/credit-notes', '/credit-notes')
    expect(await screen.findByRole('link', { name: 'AVS-2026-000001' })).toHaveAttribute(
      'href',
      `/credit-notes/${noteId}`,
    )
    expect(screen.getByText('Simple credit note')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'FAC-2026-000001' })[0]).toHaveAttribute(
      'href',
      `/invoices/${invoiceId}`,
    )
    expect(screen.getAllByText('Atlas Market').length).toBe(2)
    expect(screen.getAllByText(/120\.00 MAD/).length).toBe(2)
    expect(screen.getByRole('link', { name: 'Draft credit note' })).toBeInTheDocument()
  })
  it('offers the edit action only for drafts with credit_notes.update', async () => {
    state.permissions.add('credit_notes.update')
    state.listCreditNotes.mockResolvedValue({
      items: [{ ...note, number: 'AVO-2026-000001', status: 'issued' }, note],
      total: 2,
      limit: 25,
      offset: 0,
    })
    setup(<CreditNotesPage />, '/credit-notes', '/credit-notes')
    await screen.findByRole('link', { name: 'AVO-2026-000001' })
    expect(screen.getAllByRole('link', { name: 'Edit credit note' })).toHaveLength(1)
  })
})

describe('credit note detail', () => {
  const detail = () =>
    setup(<CreditNoteDetailPage />, '/credit-notes/:creditNoteId', `/credit-notes/${noteId}`)
  it('hides PDF preparation from readers without update permission', async () => {
    state.getCreditNote.mockResolvedValue({ ...note, status: 'issued', number: 'AVO-1' })
    detail()
    await screen.findByRole('heading', { name: 'AVO-1' })
    await waitFor(() => expect(state.listCreditNoteArtifacts).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: /Prepare PDF/ })).toBeNull()
    expect(state.prepareCreditNotePdf).not.toHaveBeenCalled()
  })
  it('offers an existing PDF to readers without update permission', async () => {
    state.getCreditNote.mockResolvedValue({ ...note, status: 'issued', number: 'AVO-1' })
    state.listCreditNoteArtifacts.mockResolvedValue([{ id: 'artifact' }])
    detail()
    expect(await screen.findByRole('button', { name: /Download PDF/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Prepare PDF/ })).toBeNull()
  })
  it('shows the corrected invoice link, reason, lines and totals', async () => {
    detail()
    expect(
      await screen.findByRole('link', { name: 'Corrects invoice N° FAC-2026-000001' }),
    ).toHaveAttribute('href', `/invoices/${invoiceId}`)
    expect(screen.getByText('Returned goods')).toBeInTheDocument()
    expect(screen.getByText('Argan oil')).toBeInTheDocument()
    expect(screen.getByText(/Total excl\. VAT:/).parentElement).toHaveTextContent('100.00 MAD')
    expect(screen.getByText(/Total incl\. VAT:/).parentElement).toHaveTextContent('120.00 MAD')
  })
  it('offers edit, issue and delete only for a draft, each behind its grant', async () => {
    state.permissions.add('credit_notes.update')
    detail()
    await screen.findByRole('heading', { name: 'Draft credit note' })
    expect(screen.getByRole('link', { name: /Edit/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Issue credit note' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
  })
  it('shows delete with credit_notes.delete and confirms before deleting', async () => {
    state.permissions.add('credit_notes.delete')
    const location = detail()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete draft' }))
    const dialog = await screen.findByRole('dialog')
    expect(state.deleteCreditNote).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(state.deleteCreditNote).toHaveBeenCalledWith(noteId, { expectedVersion: 3 }),
    )
    await waitFor(() => expect(location.history.at(-1)).toBe('/credit-notes'), { timeout: 5000 })
  })
  it('asks for confirmation before issuing', async () => {
    state.permissions.add('credit_notes.update')
    detail()
    fireEvent.click(await screen.findByRole('button', { name: 'Issue credit note' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('freezes this credit note')
    expect(state.issueCreditNote).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(state.issueCreditNote).toHaveBeenCalledWith(noteId, { expectedVersion: 3 }),
    )
  })
  it('has no edit, issue or delete for an issued credit note and downloads the PDF', async () => {
    state.permissions = new Set([
      'credit_notes.read',
      'credit_notes.update',
      'credit_notes.delete',
      'invoices.read',
    ])
    state.getCreditNote.mockResolvedValue({
      ...note,
      number: 'AVS-2026-000002',
      status: 'issued',
      kind: 'simple',
    })
    detail()
    await screen.findByRole('heading', { name: 'AVS-2026-000002' })
    expect(screen.queryByRole('button', { name: 'Delete draft' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Issue credit note' })).toBeNull()
    expect(screen.queryByRole('link', { name: /Edit/ })).toBeNull()
    expect(screen.getByText('This document is not a legal tax credit note.')).toBeInTheDocument()
    expect(screen.getByText('Simple credit note')).toBeInTheDocument()
    state.prepareCreditNotePdf.mockResolvedValue({ jobId: noteId, status: 'queued' })
    fireEvent.click(screen.getByRole('button', { name: /Prepare PDF/ }))
    await waitFor(() => expect(state.prepareCreditNotePdf).toHaveBeenCalledWith(noteId))
  })
})
