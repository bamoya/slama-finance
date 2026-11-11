import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  apiError,
  calls,
  expectNoFreshCode,
  mockApi,
  ownerDetail,
  ownerId,
  renderAt,
  session,
  useAdminTestLifecycle,
} from '../shared/api-mock'
import { coverageEnd, todayIso } from './components/coverage-period'
import { AdminCustomerDetailPage } from './pages/customer-detail-page'

useAdminTestLifecycle()
afterEach(expectNoFreshCode)

const trialDetail = (status = 'trial') => {
  const detail = ownerDetail()
  detail.subscription.planCode = 'trial'
  detail.subscription.planName = 'Trial'
  detail.subscription.status = status
  detail.subscription.paidThroughAt = null as never
  return detail
}

function setup(detail = trialDetail(), activation?: { status?: number; body?: unknown }) {
  mockApi((key) => {
    if (key === 'GET /api/v1/admin/auth/me') return { body: session }
    if (key === `GET /api/v1/admin/owners/${ownerId}`) return { body: detail }
    if (key === 'GET /api/v1/admin/billing-settings')
      return {
        body: {
          currency: 'MAD',
          taxRateBasisPoints: 2000,
          paymentMethods: ['bank_transfer', 'cash'],
          paymentInstructions: '',
          issuer: {
            legalName: 'B-Finance SARL',
            address: '',
            ice: '',
            registrationNumber: '',
            taxIdentifier: '',
            taxMention: '',
            paymentTerms: '',
          },
          issuerMissing: [],
        },
      }
    if (key === `POST /api/v1/admin/owners/${ownerId}/subscription/activation`)
      return activation ?? { body: detail }
  })
  renderAt(`/customers/${ownerId}`, <AdminCustomerDetailPage customerId={ownerId} />)
}

async function openMenu() {
  fireEvent.pointerDown(await screen.findByRole('button', { name: 'Actions' }), {
    button: 0,
    ctrlKey: false,
  })
}
const activation = () =>
  calls.filter((call) => call.url === `/api/v1/admin/owners/${ownerId}/subscription/activation`)

describe('activate a plan', () => {
  it.each(['trial', 'past_due', 'expired'])('is offered on a %s trial', async (status) => {
    setup(trialDetail(status))
    await openMenu()
    expect(await screen.findByRole('menuitem', { name: 'Activate a plan' })).toBeInTheDocument()
  })

  it('is not offered to paid customers, who keep Change plan', async () => {
    setup(ownerDetail())
    await openMenu()
    expect(await screen.findByRole('menuitem', { name: 'Change plan' })).toBeEnabled()
    expect(screen.queryByRole('menuitem', { name: 'Activate a plan' })).toBeNull()
  })

  it('is not offered to a suspended trial', async () => {
    setup(trialDetail('suspended'))
    await openMenu()
    await screen.findByRole('menuitem', { name: 'Resume subscription' })
    expect(screen.queryByRole('menuitem', { name: 'Activate a plan' })).toBeNull()
  })

  it('activates with explicit dates, a confirmed payment and a reason', async () => {
    setup()
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Activate a plan' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).queryByLabelText('Authenticator code')).toBeNull()
    const start = todayIso()
    fireEvent.change(within(dialog).getByLabelText('Coverage ends'), {
      target: { value: coverageEnd(start, 'annual') },
    })
    await waitFor(() => expect(within(dialog).getByLabelText('Payment method')).toBeInTheDocument())
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate plan' }))
    expect(await within(dialog).findByText('Indicate the reason for this action.')).toBeVisible()
    expect(activation()).toHaveLength(0)
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), {
      target: { value: 'Paid by transfer' },
    })
    fireEvent.change(within(dialog).getByLabelText('Received reference'), {
      target: { value: 'VIR-77' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate plan' }))
    await waitFor(() => expect(activation()).toHaveLength(1))
    expect(activation()[0]!.data).toEqual({
      planCode: 'essential',
      cycle: 'monthly',
      startsOn: start,
      endsOn: coverageEnd(start, 'annual'),
      settlement: 'confirmed_payment',
      paymentMethod: 'bank_transfer',
      receivedReference: 'VIR-77',
      reason: 'Paid by transfer',
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('needs a payment reference unless the access is complimentary', async () => {
    setup()
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Activate a plan' }))
    const dialog = await screen.findByRole('dialog')
    await waitFor(() => expect(within(dialog).getByLabelText('Payment method')).toBeInTheDocument())
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), {
      target: { value: 'Goodwill' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate plan' }))
    expect(activation()).toHaveLength(0)
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Complimentary' }))
    expect(within(dialog).queryByLabelText('Received reference')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate plan' }))
    await waitFor(() => expect(activation()).toHaveLength(1))
    const data = activation()[0]!.data as Record<string, unknown>
    expect(data).toMatchObject({ settlement: 'complimentary', reason: 'Goodwill' })
    expect(data).not.toHaveProperty('paymentMethod')
    expect(data).not.toHaveProperty('receivedReference')
  })

  it('refuses an end that does not follow the start', async () => {
    setup()
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Activate a plan' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Complimentary' }))
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), { target: { value: 'x' } })
    fireEvent.change(within(dialog).getByLabelText('Coverage ends'), {
      target: { value: todayIso() },
    })
    expect(within(dialog).getByText(/end must be after the start/)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate plan' }))
    expect(activation()).toHaveLength(0)
  })

  it('keeps the dialog open and the inputs when the server refuses', async () => {
    setup(trialDetail(), apiError(409, 'SUBSCRIPTION_NOT_TRIAL'))
    await openMenu()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Activate a plan' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Complimentary' }))
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), {
      target: { value: 'Goodwill' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Activate plan' }))
    expect(await within(dialog).findByText('server SUBSCRIPTION_NOT_TRIAL')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Reason (internal)')).toHaveValue('Goodwill')
  })
})
