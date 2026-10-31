import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  apiError,
  calls,
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
    if (key === 'GET /v1/admin/auth/me') return { body: session }
    if (key === `GET /v1/admin/owners/${ownerId}`) return { body: detail }
    if (key.startsWith('POST ')) return post?.(key) ?? { status: 204 }
  })
  renderAt(`/admin/customers/${ownerId}`, <AdminCustomerDetailPage customerId={ownerId} />)
}

async function openAction(name: string) {
  const trigger = await screen.findByRole('button', { name: 'Actions' })
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
  fireEvent.click(await screen.findByRole('menuitem', { name }))
  return screen.findByRole('dialog')
}

const posts = () => calls.filter((call) => call.method === 'POST')
const reasonField = () => screen.getByLabelText('Reason (internal)')
const codeField = () => screen.getByLabelText('Authenticator code')

describe('customer lifecycle actions', () => {
  it('offers blocking, not unblocking, for a customer that is not blocked', async () => {
    setup()
    const trigger = await screen.findByRole('button', { name: 'Actions' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false })
    expect(await screen.findByRole('menuitem', { name: 'Block customer' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Unblock customer' })).toBeNull()
  })

  it('block needs a reason and a fresh 6-digit code, then posts both', async () => {
    setup()
    await openAction('Block customer')
    expect(
      screen.getByText(/Organizations of this customer become unavailable \(1\)/),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Block customer' }))
    expect(await screen.findByText('Indicate the reason for this action.')).toBeInTheDocument()
    expect(
      screen.getByText('Enter the 6-digit code from your authenticator app.'),
    ).toBeInTheDocument()
    expect(posts()).toHaveLength(0)
    fireEvent.change(reasonField(), { target: { value: 'Chargeback dispute' } })
    fireEvent.change(codeField(), { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: 'Block customer' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/v1/admin/owners/${ownerId}/block`,
      data: { reason: 'Chargeback dispute', code: '123456' },
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('shows a French-ready message when the code is refused and keeps the dialog open', async () => {
    setup(ownerDetail(), () => apiError(403, 'TWO_FACTOR_INVALID'))
    await openAction('Block customer')
    fireEvent.change(reasonField(), { target: { value: 'Fraud' } })
    fireEvent.change(codeField(), { target: { value: '000000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Block customer' }))
    expect(await screen.findByText('server TWO_FACTOR_INVALID')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('delete stays disabled until the customer email is typed, then needs reason and code', async () => {
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
    fireEvent.change(codeField(), { target: { value: '654321' } })
    fireEvent.click(submit)
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/v1/admin/owners/${ownerId}/deletion`,
      data: { reason: 'Customer request', code: '654321' },
    })
  })

  it('unblocking needs only a reason and no code', async () => {
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
    expect(screen.queryByLabelText('Authenticator code')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Unblock customer' }))
    expect(await screen.findByText('Indicate the reason for this action.')).toBeInTheDocument()
    fireEvent.change(reasonField(), { target: { value: 'Resolved' } })
    fireEvent.click(screen.getByRole('button', { name: 'Unblock customer' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/v1/admin/owners/${ownerId}/unblock`,
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
      url: `/v1/admin/owners/${ownerId}/subscription/plan`,
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
      url: `/v1/admin/owners/${ownerId}/subscription/extension`,
      data: { days: 15, reason: 'Outage compensation' },
    })
  })

  it('suspends an organization from its row menu with a sensitive code', async () => {
    setup()
    const row = await screen.findByRole('button', { name: 'Actions for Atlas Conseil' })
    fireEvent.pointerDown(row, { button: 0, ctrlKey: false })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Suspend organization' }))
    await screen.findByRole('dialog')
    fireEvent.change(reasonField(), { target: { value: 'Abuse report' } })
    fireEvent.change(codeField(), { target: { value: '111222' } })
    fireEvent.click(screen.getByRole('button', { name: 'Suspend organization' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `/v1/admin/organizations/${organizationId}/suspend`,
      data: { reason: 'Abuse report', code: '111222' },
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
