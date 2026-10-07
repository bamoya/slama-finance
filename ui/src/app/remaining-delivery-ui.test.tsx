import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router, Switch } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { PageActionsProvider } from '../components/management/page-actions-context'
import { ClientNotificationPreferences } from '../features/clients/components/client-notification-preferences'
import { NotificationRulePage, NotificationsPage } from '../features/notifications'
import { DocumentNotificationHistory } from '../features/sales/notifications/components/document-notification-history'
import { SendDocumentDialog } from '../features/sales/notifications/components/send-document-dialog'
import { ApiError } from '../lib/api-error'

const state = vi.hoisted(() => ({
  keys: [] as string[],
  listNotificationRules: vi.fn(),
  testNotificationRule: vi.fn(),
  updateNotificationRule: vi.fn(),
  previewNotificationRule: vi.fn(),
  listClientNotificationPreferences: vi.fn(),
  updateClientNotificationPreference: vi.fn(),
  deleteClientNotificationPreference: vi.fn(),
  sendInvoice: vi.fn(),
  listDocumentNotifications: vi.fn(),
}))
vi.mock('../features/identity/auth/hooks/use-session', () => ({
  useSession: () => ({ data: { purpose: 'full', permissionKeys: state.keys }, isError: false }),
}))
vi.mock('../api/http', async () => {
  const { routeApiRequest } = await import('../test/api-transport')
  return {
    apiRequest: routeApiRequest({
      listNotificationRules: state.listNotificationRules,
      testNotificationRule: state.testNotificationRule,
      updateNotificationRule: state.updateNotificationRule,
      previewNotificationRule: state.previewNotificationRule,
      listClientNotificationPreferences: state.listClientNotificationPreferences,
      updateClientNotificationPreference: state.updateClientNotificationPreference,
      deleteClientNotificationPreference: state.deleteClientNotificationPreference,
      sendInvoice: state.sendInvoice,
      listDocumentNotifications: state.listDocumentNotifications,
    }),
  }
})
const id = '11111111-1111-4111-8111-111111111111',
  ruleId = '22222222-2222-4222-8222-222222222222'
const rule = {
  id: ruleId,
  eventKey: 'invoice_sent',
  enabled: false,
  offsetDays: 0,
  repeatEveryDays: null,
  senderName: 'Slama',
  senderEmail: 'finance@example.test',
  locale: 'fr-MA',
  subjectTemplate: 'Invoice {{number}}',
  bodyTemplate: 'Hello {{clientName}}',
  version: 3,
  variables: ['number', 'clientName'],
  timingSupported: false,
}
const preference = {
  ruleId,
  eventKey: 'invoice_sent',
  globalEnabled: false,
  overrideEnabled: null,
  cc: [],
  version: 0,
  effectiveEnabled: false,
  reason: 'RULE_DISABLED',
  recipient: 'client@example.test',
}
const caches: QueryClient[] = []
afterEach(() => caches.splice(0).forEach((cache) => cache.clear()))
function setup(node: React.ReactNode, path = '/settings/notifications') {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  caches.push(cache)
  return render(
    <QueryClientProvider client={cache}>
      <Router hook={memoryLocation({ path }).hook}>
        <PageActionsProvider>{node}</PageActionsProvider>
      </Router>
    </QueryClientProvider>,
  )
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
  state.keys = [
    'notification_rules.read',
    'notification_rules.update',
    'notification_rules.update',
    'clients.read',
    'client_notification_preferences.read',
    'client_notification_preferences.update',
    'client_notification_preferences.update',
    'invoices.read',
    'invoices.update',
    'notification_dispatches.read',
  ]
  state.listNotificationRules.mockResolvedValue({
    items: [rule],
    permittedSenderEmails: [rule.senderEmail],
  })
  state.testNotificationRule.mockResolvedValue({ messageId: id, status: 'queued' })
  state.updateNotificationRule.mockResolvedValue({ ...rule, version: 4 })
  state.previewNotificationRule.mockResolvedValue({
    subject: 'Invoice sample',
    html: '<p>Preview</p>',
    text: 'Preview',
    modified: false,
  })
  state.listClientNotificationPreferences.mockResolvedValue({ items: [preference] })
  state.updateClientNotificationPreference.mockResolvedValue({
    ...preference,
    overrideEnabled: true,
    version: 1,
  })
  state.deleteClientNotificationPreference.mockResolvedValue(undefined)
  state.sendInvoice.mockResolvedValue({
    jobId: id,
    status: 'queued',
    recipient: 'client@example.test',
    sourceVersion: 1,
  })
  state.listDocumentNotifications.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 })
})
describe('notification policies, preferences and sends', () => {
  const ruleRoutes = (
    <Switch>
      <Route path="/settings/notifications/:ruleId/edit">
        <NotificationRulePage edit />
      </Route>
      <Route path="/settings/notifications/:ruleId">
        <NotificationRulePage />
      </Route>
      <Route path="/settings/notifications">
        <NotificationsPage />
      </Route>
    </Switch>
  )
  it('opens a rule detail page and edits in the shared header instead of a modal', async () => {
    setup(ruleRoutes)
    fireEvent.click(await screen.findByRole('link', { name: 'Invoice send' }))
    expect(await screen.findByText('Configuration')).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Configure' }))
    expect(await screen.findByLabelText('Sender name')).toHaveValue('Slama')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Save changes' }).closest('[data-slot="page-header"]'),
    ).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'Updated {{number}}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(state.updateNotificationRule).toHaveBeenCalledWith(
        ruleId,
        expect.objectContaining({
          expectedVersion: 3,
          subjectTemplate: 'Updated {{number}}',
          bodyTemplate: rule.bodyTemplate,
          bodyFormat: 'text',
        }),
      ),
    )
    expect(await screen.findByText('Configuration')).toBeVisible()
    expect(state.testNotificationRule).not.toHaveBeenCalled()
  })
  it('opens direct edit links, retains HTML and timing fields, and cancels without saving', async () => {
    const html = '<table><tr><td>{{number}}</td></tr></table>'
    state.listNotificationRules.mockResolvedValue({
      items: [
        {
          ...rule,
          eventKey: 'invoice_due_reminder',
          timingSupported: true,
          offsetDays: -3,
          repeatEveryDays: 7,
          bodyFormat: 'html',
          bodyTemplate: html,
        },
      ],
      permittedSenderEmails: [rule.senderEmail],
    })
    setup(ruleRoutes, `/settings/notifications/${ruleId}/edit`)
    expect(await screen.findByLabelText('Days from due / expiry date')).toHaveValue(-3)
    expect(screen.getByLabelText('Repeat every days (optional)')).toHaveValue(7)
    expect(screen.getByRole('textbox', { name: 'HTML source' })).toHaveValue(html)
    fireEvent.click(screen.getByRole('link', { name: 'Cancel' }))
    expect(await screen.findByText('Configuration')).toBeVisible()
    expect(state.updateNotificationRule).not.toHaveBeenCalled()
  })
  it('reloads the current rule after a stale-version conflict without silently overwriting it', async () => {
    state.updateNotificationRule.mockRejectedValueOnce(new ApiError(409, 'CONFLICT', 'Changed'))
    setup(ruleRoutes, `/settings/notifications/${ruleId}/edit`)
    await screen.findByLabelText('Subject')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByRole('dialog')).toBeVisible()
    state.listNotificationRules.mockResolvedValue({
      items: [{ ...rule, version: 5, subjectTemplate: 'New saved subject' }],
      permittedSenderEmails: [rule.senderEmail],
    })
    fireEvent.click(screen.getByRole('button', { name: 'Discard edits and reload' }))
    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveValue('New saved subject'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    state.updateNotificationRule.mockResolvedValue({ ...rule, version: 6 })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(state.updateNotificationRule).toHaveBeenLastCalledWith(
        ruleId,
        expect.objectContaining({ expectedVersion: 5 }),
      ),
    )
  })
  it('allows read-only details but denies the edit page and preview mutation', async () => {
    state.keys = ['notification_rules.read']
    const view = setup(ruleRoutes, `/settings/notifications/${ruleId}`)
    expect(await screen.findByText('Configuration')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Configure' })).not.toBeInTheDocument()
    expect(state.previewNotificationRule).not.toHaveBeenCalled()
    view.unmount()
    setup(ruleRoutes, `/settings/notifications/${ruleId}/edit`)
    expect(await screen.findByText('Access denied')).toBeVisible()
    expect(screen.queryByLabelText('Subject')).not.toBeInTheDocument()
  })
  it('shows an explicit not-found state for an unknown rule', async () => {
    setup(ruleRoutes, `/settings/notifications/${id}`)
    expect(await screen.findByText('Notification rule not found')).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
  it('shows persisted default-disabled rules and explicit synthetic test queue feedback', async () => {
    setup(<NotificationsPage />)
    await screen.findByText('Disabled')
    fireEvent.click(screen.getByRole('button', { name: 'Send synthetic test to me' }))
    expect(await screen.findByText(/Synthetic test queued/)).toBeInTheDocument()
    expect(state.testNotificationRule).toHaveBeenCalledWith(ruleId)
    expect(state.sendInvoice).not.toHaveBeenCalled()
  })
  it('hides configuration and test controls without individual action grants', async () => {
    state.keys = ['notification_rules.read']
    setup(<NotificationsPage />)
    await screen.findByText('Disabled')
    expect(screen.queryByRole('link', { name: 'Configure' })).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Send synthetic test to me' }),
    ).not.toBeInTheDocument()
  })
  it('defaults to company settings and cannot enable a disabled company rule when customized', async () => {
    setup(<ClientNotificationPreferences id={id} />)
    await screen.findByText('Company defaults')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Customize preferences' }))
    expect(screen.getByRole('switch', { name: 'Receive email Invoice send' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(state.updateClientNotificationPreference).toHaveBeenCalledWith(id, ruleId, {
        expectedVersion: 0,
        enabled: false,
        cc: [],
      }),
    )
  })
  it('rejects malformed CC before any API mutation', async () => {
    state.listClientNotificationPreferences.mockResolvedValue({
      items: [{ ...preference, globalEnabled: true, effectiveEnabled: true, reason: null }],
    })
    setup(<ClientNotificationPreferences id={id} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Customize preferences' }))
    fireEvent.change(screen.getByLabelText('Additional recipients'), {
      target: { value: 'bad-email' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(
      await screen.findByText('Use unique valid email addresses, up to 10.'),
    ).toBeInTheDocument()
    expect(state.updateClientNotificationPreference).not.toHaveBeenCalled()
  })
  it('resets a versioned override to inherit using the current version', async () => {
    state.listClientNotificationPreferences.mockResolvedValue({
      items: [{ ...preference, overrideEnabled: false, version: 4 }],
    })
    setup(<ClientNotificationPreferences id={id} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Customize preferences' }))
    expect(state.deleteClientNotificationPreference).not.toHaveBeenCalled()
    const confirmation = await screen.findByRole('dialog')
    state.listClientNotificationPreferences.mockResolvedValue({ items: [preference] })
    fireEvent.click(within(confirmation).getByRole('button', { name: 'Restore defaults' }))
    await waitFor(() =>
      expect(state.deleteClientNotificationPreference).toHaveBeenCalledWith(id, ruleId, {
        expectedVersion: 4,
      }),
    )
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Customize preferences' })).not.toBeChecked(),
    )
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
  it('keeps explanations behind an info icon that opens on click', async () => {
    setup(<ClientNotificationPreferences id={id} />)
    const help = await screen.findByRole('button', { name: 'About email preferences' })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.click(help)
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'An explicit opt-in cannot bypass a disabled global rule',
    )
  })
  it('adds removable email chips and includes uncommitted input in one save', async () => {
    state.listClientNotificationPreferences.mockResolvedValue({
      items: [{ ...preference, globalEnabled: true, effectiveEnabled: true, reason: null }],
    })
    setup(<ClientNotificationPreferences id={id} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Customize preferences' }))
    const input = screen.getByLabelText('Additional recipients')
    fireEvent.change(input, { target: { value: 'first@example.test' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Remove first@example.test' })).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'second@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() =>
      expect(state.updateClientNotificationPreference).toHaveBeenCalledWith(id, ruleId, {
        expectedVersion: 0,
        enabled: true,
        cc: ['first@example.test', 'second@example.test'],
      }),
    )
  })
  it('discards a new customization without creating an override', async () => {
    setup(<ClientNotificationPreferences id={id} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Customize preferences' }))
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.getByRole('switch', { name: 'Customize preferences' })).not.toBeChecked()
    expect(state.updateClientNotificationPreference).not.toHaveBeenCalled()
    expect(state.deleteClientNotificationPreference).not.toHaveBeenCalled()
  })
  it('keeps saved customizations when restoring defaults is cancelled', async () => {
    state.listClientNotificationPreferences.mockResolvedValue({
      items: [{ ...preference, overrideEnabled: false, version: 4 }],
    })
    setup(<ClientNotificationPreferences id={id} />)
    const toggle = await screen.findByRole('switch', { name: 'Customize preferences' })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(toggle).toBeChecked()
    expect(state.deleteClientNotificationPreference).not.toHaveBeenCalled()
  })
  it('does not expose edits or restoration without their action grants', async () => {
    state.keys = ['clients.read', 'client_notification_preferences.read']
    setup(<ClientNotificationPreferences id={id} />)
    await screen.findByText('Company defaults')
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
  })
  it('preserves completed versions and retries only the remaining rows after a partial save', async () => {
    const secondId = '33333333-3333-4333-8333-333333333333'
    const first = { ...preference, globalEnabled: true, effectiveEnabled: true, reason: null }
    const second = { ...first, ruleId: secondId, eventKey: 'estimate_sent' }
    state.listClientNotificationPreferences.mockResolvedValue({ items: [first, second] })
    state.updateClientNotificationPreference
      .mockResolvedValueOnce({ ...first, overrideEnabled: true, version: 1 })
      .mockRejectedValueOnce(new ApiError(503, 'UNAVAILABLE', 'Try again'))
      .mockResolvedValueOnce({ ...second, overrideEnabled: true, version: 1 })
    setup(<ClientNotificationPreferences id={id} />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Customize preferences' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByText(/Some changes were saved/)
    const save = screen.getByRole('button', { name: 'Save changes' })
    await waitFor(() => expect(save).not.toBeDisabled())
    fireEvent.click(save)
    await screen.findByText('Preferences saved')
    expect(state.updateClientNotificationPreference.mock.calls.map((call) => call[1])).toEqual([
      ruleId,
      secondId,
      secondId,
    ])
  })
  it('blocks a manual send when the current policy is disabled', async () => {
    setup(<SendDocumentDialog documentType="invoice" id={id} clientId={id} version={7} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Global rule disabled')
    expect(within(dialog).getByRole('button', { name: 'Send email' })).toBeDisabled()
    expect(state.sendInvoice).not.toHaveBeenCalled()
  })
  it('retains the exact request identity and version across an ambiguous network retry', async () => {
    state.listClientNotificationPreferences.mockResolvedValue({
      items: [{ ...preference, globalEnabled: true, effectiveEnabled: true, reason: null }],
    })
    state.sendInvoice.mockRejectedValueOnce(
      new ApiError(0, 'NETWORK_ERROR', 'Connection interrupted.'),
    )
    setup(<SendDocumentDialog documentType="invoice" id={id} clientId={id} version={7} />)
    fireEvent.click(screen.getByRole('button', { name: 'Send email' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('Recipient: client@example.test')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send email' }))
    await within(dialog).findByText('Connection interrupted.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send email' }))
    await within(dialog).findByText(/Preparation queued/)
    expect(state.sendInvoice).toHaveBeenCalledTimes(2)
    expect(state.sendInvoice.mock.calls[0]).toEqual(state.sendInvoice.mock.calls[1])
    expect(state.sendInvoice.mock.calls[0]?.[1]).toEqual({
      expectedVersion: 7,
      requestId: expect.any(String),
    })
  })
  it('labels preparation and provider acceptance separately and hides dispatch actions', async () => {
    state.keys = state.keys.filter((key) => key !== 'invoices.update')
    state.listDocumentNotifications.mockResolvedValue({
      items: [
        {
          id,
          kind: 'preparation',
          status: 'failed',
          createdAt: '2026-10-02T10:00:00Z',
          attempts: 2,
          errorCode: 'PREPARATION_FAILED',
          recipient: 'client@example.test',
          eventKey: 'invoice_sent',
        },
        {
          id: ruleId,
          kind: 'dispatch',
          status: 'sent',
          createdAt: '2026-10-02T10:01:00Z',
          attempts: 1,
          errorCode: null,
          recipient: 'client@example.test',
          eventKey: 'invoice_sent',
        },
      ],
      total: 2,
      limit: 25,
      offset: 0,
    })
    setup(<DocumentNotificationHistory documentType="invoice" id={id} />)
    fireEvent.click(screen.getByText('Email history'))
    await screen.findByText('Provider accepted')
    expect(screen.getByText('Preparation')).toBeInTheDocument()
    expect(screen.getByText('PREPARATION_FAILED')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })
})
