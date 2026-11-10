import { fireEvent, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  apiError,
  calls,
  expectNoFreshCode,
  mockApi,
  organizationId,
  ownerDetail,
  ownerId,
  payment,
  renderAt,
  session,
  useAdminTestLifecycle,
} from '../shared/api-mock'
import { AdminCustomerDetailPage } from './pages/customer-detail-page'

useAdminTestLifecycle()

type Reply = { status?: number; body?: unknown }

function setup(detail = ownerDetail(), post?: (key: string) => Reply | undefined) {
  mockApi((key) => {
    if (key === 'GET /api/v1/admin/auth/me') return { body: session }
    if (key === `GET /api/v1/admin/owners/${ownerId}`) return { body: detail }
    if (key.startsWith('POST ')) return post?.(key) ?? { status: 204 }
  })
  renderAt(`/customers/${ownerId}`, <AdminCustomerDetailPage customerId={ownerId} />)
}

async function openAction(name: string) {
  const trigger = await screen.findByRole('button', { name: 'Actions' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole('menuitem', { name }))
  return screen.findByRole('dialog')
}

const posts = () => calls.filter((call) => call.method === 'POST')
const reasonField = () => screen.getByLabelText('Reason (internal)')
afterEach(expectNoFreshCode)

describe('customer lifecycle actions', () => {
  it('titles the page with the full name and shows the email underneath', async () => {
    setup()
    expect(await screen.findByRole('heading', { name: 'Sara Alaoui' })).toBeInTheDocument()
    expect(screen.getByText('owner@example.test')).toBeInTheDocument()
  })

  it('offers blocking, not unblocking, for a customer that is not blocked', async () => {
    setup()
    const trigger = await screen.findByRole('button', { name: 'Actions' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    expect(await screen.findByRole('menuitem', { name: 'Block customer' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Unblock customer' })).toBeNull()
  })

  it('block needs a reason, shows no code field, then posts the reason only', async () => {
    setup()
    await openAction('Block customer')
    expect(
      screen.getByText(/Organizations of this customer become unavailable \(1\)/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Block customer' }))
    expect(await screen.findByText('Indicate the reason for this action.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Authenticator code')).toBeNull()
    expect(posts()).toHaveLength(0)
    fireEvent.change(reasonField(), { target: { value: 'Chargeback dispute' } })
    fireEvent.click(screen.getByRole('button', { name: 'Block customer' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/owners/${ownerId}/block`,
      data: { reason: 'Chargeback dispute' },
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows the server refusal and keeps the dialog and reason open', async () => {
    setup(ownerDetail(), () => apiError(409, 'ALREADY_BLOCKED'))
    await openAction('Block customer')
    fireEvent.change(reasonField(), { target: { value: 'Fraud' } })
    fireEvent.click(screen.getByRole('button', { name: 'Block customer' }))
    expect(await screen.findByText('server ALREADY_BLOCKED')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(reasonField()).toHaveValue('Fraud')
  })

  it('delete stays disabled until the customer email is typed, then needs a reason', async () => {
    setup()
    await openAction('Delete customer')
    const submit = screen.getByRole('button', { name: 'Delete customer' })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type the customer email to confirm'), {
      target: { value: 'wrong@example.test' },
    })
    expect(submit).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Type the customer email to confirm'), {
      target: { value: 'owner@example.test' },
    })
    expect(submit).toBeEnabled()
    fireEvent.change(reasonField(), { target: { value: 'Customer request' } })
    fireEvent.click(submit)
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/owners/${ownerId}/deletion`,
      data: { reason: 'Customer request' },
    })
  })

  it('unblocking requires a reason only', async () => {
    setup(
      ownerDetail({
        restriction: {
          blockedAt: '2026-10-20T09:00:00Z',
          blockReason: 'Chargeback dispute',
          deletionRequestedAt: null,
          deletionDueAt: null,
          deletionReason: null,
        },
      }),
    )
    expect(await screen.findByText(/Chargeback dispute/)).toBeInTheDocument()
    await openAction('Unblock customer')
    fireEvent.click(screen.getByRole('button', { name: 'Unblock customer' }))
    expect(await screen.findByText('Indicate the reason for this action.')).toBeInTheDocument()
    fireEvent.change(reasonField(), { target: { value: 'Resolved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unblock customer' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/owners/${ownerId}/unblock`,
      data: { reason: 'Resolved' },
    })
  })

  it('changes the plan to the chosen one with a reason', async () => {
    setup()
    await openAction('Change plan')
    expect(screen.getByText(/no payment is requested or recorded/i)).toBeInTheDocument()
    fireEvent.change(reasonField(), { target: { value: 'Goodwill' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change plan' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/owners/${ownerId}/subscription/plan`,
      data: { planCode: 'business', reason: 'Goodwill' },
    })
  })

  it('extends coverage by a number of days between 1 and 366', async () => {
    setup()
    await openAction('Extend coverage')
    fireEvent.change(reasonField(), { target: { value: 'Outage compensation' } })
    fireEvent.change(screen.getByLabelText('Days to add'), { target: { value: '400' } })
    fireEvent.click(screen.getByRole('button', { name: 'Extend coverage' }))
    expect(posts()).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('Days to add'), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Extend coverage' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/owners/${ownerId}/subscription/extension`,
      data: { days: 15, reason: 'Outage compensation' },
    })
  })

  it('resumes a subscription with a reason only', async () => {
    const detail = ownerDetail()
    detail.subscription.status = 'suspended'
    setup(detail)
    await openAction('Resume subscription')
    fireEvent.change(reasonField(), { target: { value: 'Resolved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Resume subscription' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/owners/${ownerId}/subscription/resume`,
      data: { reason: 'Resolved' },
    })
  })

  it('keeps the reason when a plan change is refused', async () => {
    setup(ownerDetail(), () => apiError(409, 'NO_PAID_PERIOD'))
    await openAction('Change plan')
    fireEvent.change(reasonField(), { target: { value: 'Goodwill' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change plan' }))
    await screen.findByText('server NO_PAID_PERIOD')
    expect(reasonField()).toHaveValue('Goodwill')
  })

  it('suspends an organization from its row menu ', async () => {
    setup()
    const row = await screen.findByRole('button', { name: 'Actions for Atlas Conseil' })
    fireEvent.pointerDown(row, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend organization' }))
    await screen.findByRole('dialog')
    fireEvent.change(reasonField(), { target: { value: 'Abuse report' } })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend organization' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/organizations/${organizationId}/suspend`,
      data: { reason: 'Abuse report' },
    })
  })

  async function openAddressDialog() {
    const row = await screen.findByRole('button', { name: 'Actions for Atlas Conseil' })
    fireEvent.pointerDown(row, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change address' }))
    await screen.findByRole('dialog')
  }

  it('changes an organization address with a live preview, and a reason', async () => {
    setup()
    await openAddressDialog()
    const input = screen.getByLabelText('New address')
    fireEvent.change(input, { target: { value: 'Atlas  Conseil_2' } })
    expect(input).toHaveValue('atlas-conseil-2')
    expect(
      screen.getByText(`${window.location.protocol}//atlas-conseil-2.localhost:3000`),
    ).toBeInTheDocument()
    fireEvent.change(reasonField(), { target: { value: 'Rebranding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change address' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/organizations/${organizationId}/slug`,
      data: { slug: 'atlas-conseil-2', reason: 'Rebranding' },
    })
  })

  it('refuses an unchanged or too short address without calling the API', async () => {
    setup()
    await openAddressDialog()
    for (const value of ['atlas', 'ab', '']) {
      fireEvent.change(screen.getByLabelText('New address'), { target: { value } })
      fireEvent.change(reasonField(), { target: { value: 'Rebranding' } })
      fireEvent.click(screen.getByRole('button', { name: 'Change address' }))
    }
    expect(posts()).toHaveLength(0)
  })

  it.each([
    ['SLUG_TAKEN', 409],
    ['SLUG_RESERVED', 400],
    ['SLUG_INVALID', 400],
  ])('shows the %s failure inside the dialog', async (code, status) => {
    setup(ownerDetail(), (key) => (key.endsWith('/slug') ? apiError(status, code) : undefined))
    await openAddressDialog()
    fireEvent.change(screen.getByLabelText('New address'), { target: { value: 'new-name' } })
    fireEvent.change(reasonField(), { target: { value: 'Rebranding' } })
    fireEvent.click(screen.getByRole('button', { name: 'Change address' }))
    expect(await screen.findByText(`server ${code}`)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('cancels scheduled deletion with a reason only', async () => {
    setup(
      ownerDetail({
        restriction: {
          blockedAt: null,
          blockReason: null,
          deletionRequestedAt: '2026-10-21T09:00:00Z',
          deletionDueAt: '2026-11-20T09:00:00Z',
          deletionReason: 'Request',
        },
      }),
    )
    await openAction('Cancel deletion')
    fireEvent.change(reasonField(), { target: { value: 'Resolved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel deletion' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/owners/${ownerId}/deletion/cancel`,
      data: { reason: 'Resolved' },
    })
  })

  it('reactivates an organization with a reason only', async () => {
    const detail = ownerDetail()
    detail.organizations[0]!.state = 'suspended'
    setup(detail)
    const row = await screen.findByRole('button', { name: 'Actions for Atlas Conseil' })
    fireEvent.pointerDown(row, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Reactivate organization' }))
    fireEvent.change(reasonField(), { target: { value: 'Resolved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reactivate organization' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/api/v1/admin/organizations/${organizationId}/reactivate`,
      data: { reason: 'Resolved' },
    })
  })

  it('offers resend invitation only while the invitation is pending', async () => {
    setup(ownerDetail({ invitationPending: true }))
    const trigger = await screen.findByRole('button', { name: 'Actions' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    expect(await screen.findByRole('menuitem', { name: 'Resend invitation' })).toBeInTheDocument()
  })

  it('shows restriction banners with internal reasons and the cancel-deletion action', async () => {
    setup(
      ownerDetail({
        restriction: {
          blockedAt: '2026-10-20T09:00:00Z',
          blockReason: 'Chargeback dispute',
          deletionRequestedAt: '2026-10-21T09:00:00Z',
          deletionDueAt: '2026-11-20T09:00:00Z',
          deletionReason: 'Customer request',
        },
      }),
    )
    expect(await screen.findByText('Customer request', { exact: false })).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: 'Actions' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    expect(await screen.findByRole('menuitem', { name: 'Cancel deletion' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Delete customer' })).toBeNull()
  })

  it('labels free adjustments in the payment history', async () => {
    setup(
      ownerDetail({
        payments: [
          payment({
            kind: 'upgrade',
            status: 'confirmed',
            method: 'admin',
            reference: 'ADJ-1',
            amount: {
              currency: 'MAD',
              amountHt: 0,
              taxRateBasisPoints: 2000,
              taxAmount: 0,
              amountTtc: 0,
            },
          }),
        ],
      }),
    )
    expect(await screen.findByText('Admin adjustment')).toBeInTheDocument()
  })
})
