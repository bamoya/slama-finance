import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../../lib/api-error'
import { DocumentNotificationHistory } from './components/document-notification-history'
import { SendDocumentDialog } from './components/send-document-dialog'

const state = vi.hoisted(() => ({
  keys: [] as string[],
  listClientNotificationPreferences: vi.fn(),
  listDocumentNotifications: vi.fn(),
  sendInvoice: vi.fn(),
  retryNotificationPreparation: vi.fn(),
}))
vi.mock('../../identity/auth/hooks/use-session', () => ({
  useSession: () => ({ data: { purpose: 'full', permissionKeys: state.keys }, isError: false }),
}))
vi.mock('../../../api/http', async () => {
  const { routeApiRequest } = await import('../../../test/api-transport')
  return {
    apiRequest: routeApiRequest({
      listClientNotificationPreferences: state.listClientNotificationPreferences,
      listDocumentNotifications: state.listDocumentNotifications,
      sendInvoice: state.sendInvoice,
      retryNotificationPreparation: state.retryNotificationPreparation,
    }),
  }
})
const id = '11111111-1111-4111-8111-111111111111'
const caches: QueryClient[] = []
afterEach(() => caches.splice(0).forEach((cache) => cache.clear()))
function setup(
  node: React.ReactNode = (
    <SendDocumentDialog documentType="invoice" id={id} clientId={id} version={1} />
  ),
) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  caches.push(cache)
  return render(<QueryClientProvider client={cache}>{node}</QueryClientProvider>)
}
async function openSend() {
  fireEvent.click(screen.getByRole('button', { name: 'Send email' }))
  const dialog = screen.getByRole('dialog')
  await waitFor(() =>
    expect(within(dialog).getByRole('button', { name: 'Send email' })).toBeEnabled(),
  )
  return within(dialog)
}
beforeEach(() => {
  vi.clearAllMocks()
  state.keys = [
    'invoices.read',
    'invoices.update',
    'clients.read',
    'client_notification_preferences.read',
    'notification_dispatches.read',
    'notification_dispatches.update',
  ]
  state.listClientNotificationPreferences.mockResolvedValue({
    items: [
      {
        ruleId: id,
        eventKey: 'invoice_sent',
        globalEnabled: true,
        overrideEnabled: null,
        cc: [],
        version: 1,
        effectiveEnabled: true,
        reason: null,
        recipient: 'client@example.test',
      },
    ],
  })
  state.sendInvoice.mockResolvedValue({
    jobId: id,
    status: 'queued',
    recipient: 'client@example.test',
    sourceVersion: 1,
  })
  state.listDocumentNotifications.mockResolvedValue({
    items: [
      {
        id,
        kind: 'preparation',
        status: 'failed',
        createdAt: '2026-10-02T10:00:00Z',
        attempts: 1,
        errorCode: 'ARTIFACT_UNAVAILABLE',
        recipient: 'client@example.test',
        eventKey: 'invoice_sent',
      },
    ],
    total: 1,
    limit: 25,
    offset: 0,
  })
  state.retryNotificationPreparation.mockResolvedValue(undefined)
})
describe('document notification actions', () => {
  it('preserves the request key after an ambiguous network failure', async () => {
    state.sendInvoice.mockRejectedValueOnce(
      new ApiError(0, 'NETWORK_ERROR', 'Connection interrupted.'),
    )
    setup()
    const dialog = await openSend()
    fireEvent.click(dialog.getByRole('button', { name: 'Send email' }))
    await dialog.findByText(/Connection interrupted/)
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Send email' })).toBeEnabled())
    fireEvent.click(dialog.getByRole('button', { name: 'Send email' }))
    await dialog.findByRole('button', { name: 'Start a new send' })
    expect(state.sendInvoice).toHaveBeenCalledTimes(2)
    expect(state.sendInvoice.mock.calls[1]![1]).toEqual(state.sendInvoice.mock.calls[0]![1])
  })
  it('requires a deliberate new send after success and allocates a fresh key', async () => {
    setup()
    const dialog = await openSend()
    fireEvent.click(dialog.getByRole('button', { name: 'Send email' }))
    await dialog.findByRole('button', { name: 'Start a new send' })
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled())
    expect(dialog.getByRole('button', { name: 'Send email' })).toBeDisabled()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }))
    const reopened = within(screen.getByRole('dialog'))
    expect(reopened.getByRole('button', { name: 'Send email' })).toBeDisabled()
    await waitFor(() =>
      expect(state.listClientNotificationPreferences.mock.calls.length).toBeGreaterThan(1),
    )
    const previewCalls = state.listClientNotificationPreferences.mock.calls.length
    fireEvent.click(reopened.getByRole('button', { name: 'Start a new send' }))
    await waitFor(() => expect(reopened.getByRole('button', { name: 'Send email' })).toBeEnabled())
    expect(state.listClientNotificationPreferences.mock.calls.length).toBeGreaterThan(previewCalls)
    fireEvent.click(reopened.getByRole('button', { name: 'Send email' }))
    await waitFor(() => expect(state.sendInvoice).toHaveBeenCalledTimes(2))
    expect(state.sendInvoice.mock.calls[1]![1].requestId).not.toBe(
      state.sendInvoice.mock.calls[0]![1].requestId,
    )
  })
  it('blocks confirmation when current recipient preview permission is missing', () => {
    state.keys = ['invoices.read', 'invoices.update']
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }))
    const dialog = within(screen.getByRole('dialog'))
    expect(dialog.getByRole('button', { name: 'Send email' })).toBeDisabled()
    expect(dialog.getByText(/Ask your administrator for access/)).toBeInTheDocument()
    expect(state.listClientNotificationPreferences).not.toHaveBeenCalled()
    expect(state.sendInvoice).not.toHaveBeenCalled()
  })
  it('waits for the refreshed recipient preview before confirming a new send', async () => {
    setup()
    const dialog = await openSend()
    fireEvent.click(dialog.getByRole('button', { name: 'Send email' }))
    await dialog.findByRole('button', { name: 'Start a new send' })
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Cancel' })).toBeEnabled())
    const preference = await state.listClientNotificationPreferences.mock.results[0]!.value
    let finishPreview: (() => void) | undefined
    state.listClientNotificationPreferences.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishPreview = () => resolve(preference)
        }),
    )
    fireEvent.click(dialog.getByRole('button', { name: 'Start a new send' }))
    await waitFor(() => expect(finishPreview).toBeDefined())
    expect(dialog.getByRole('button', { name: 'Send email' })).toBeDisabled()
    expect(state.sendInvoice).toHaveBeenCalledTimes(1)
    finishPreview!()
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Send email' })).toBeEnabled())
  })
  it.each([
    ['notification_dispatches.update', false],
    ['invoices.update', false],
    ['', true],
  ])('requires both retry and owner send permissions (missing %s)', async (missing, visible) => {
    state.keys = state.keys.filter((key) => key !== missing)
    setup(<DocumentNotificationHistory documentType="invoice" id={id} />)
    const history = screen.getByText('Email history').closest('details')!
    expect(history.open).toBe(false)
    fireEvent.click(screen.getByText('Email history'))
    await screen.findByText('ARTIFACT_UNAVAILABLE')
    expect(!!screen.queryByRole('button', { name: 'Retry' })).toBe(visible)
  })
})
