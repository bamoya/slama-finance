import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  apiError,
  calls,
  mockApi,
  ownerDetail,
  ownerId,
  renderAt,
  session,
  useAdminTestLifecycle,
} from '../shared/api-mock'
import { coverageEnd, midnightUtc, todayIso } from './components/coverage-period'
import { AdminNewCustomerPage } from './pages/new-customer-page'

useAdminTestLifecycle()

function setup(reply?: { status: number; body: unknown }) {
  mockApi((key) => {
    if (key === 'GET /v1/admin/auth/me') return { body: session }
    if (key === 'POST /v1/admin/owners') return reply ?? { status: 201, body: ownerDetail() }
  })
  renderAt('/admin/customers/new', <AdminNewCustomerPage />)
}

const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
const created = () => calls.filter((call) => call.method === 'POST')

function fillIdentity() {
  fill('First name', 'Sara')
  fill('Last name', 'Alaoui')
  fill('Email address', 'sara@example.test')
}

describe('new customer', () => {
  it('validates required fields before calling the API', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Create customer' }))
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThanOrEqual(4)
    expect(screen.getByText('Indicate the reason for this action.')).toBeInTheDocument()
    expect(created()).toHaveLength(0)
    expect(screen.getByText(/receives an email to set their password/)).toBeInTheDocument()
  })

  it('rejects a malformed email', async () => {
    setup()
    await screen.findByRole('button', { name: 'Create customer' })
    fillIdentity()
    fill('Email address', 'not-an-email')
    fill('Reason (internal)', 'Sales call')
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }))
    await screen.findAllByRole('alert')
    expect(created()).toHaveLength(0)
  })

  it('creates a trial customer and opens the new customer page', async () => {
    setup()
    await screen.findByRole('button', { name: 'Create customer' })
    fillIdentity()
    fill('Reason (internal)', 'Sales call')
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }))
    await waitFor(() => expect(created()).toHaveLength(1))
    expect(created()[0]).toMatchObject({
      url: '/v1/admin/owners',
      data: {
        firstName: 'Sara',
        lastName: 'Alaoui',
        email: 'sara@example.test',
        locale: 'en',
        reason: 'Sales call',
        subscription: { kind: 'trial' },
      },
    })
    await waitFor(() =>
      expect(screen.getByTestId('location')).toHaveTextContent(`/admin/customers/${ownerId}`),
    )
  })

  it('computes the coverage end of a paid plan from the cycle', async () => {
    setup()
    await screen.findByRole('button', { name: 'Create customer' })
    fireEvent.click(screen.getByRole('radio', { name: /Paid plan/ }))
    fillIdentity()
    fill('Reason (internal)', 'Annual deal')
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }))
    await waitFor(() => expect(created()).toHaveLength(1))
    const start = todayIso()
    expect(created()[0]?.data).toMatchObject({
      subscription: {
        kind: 'paid',
        planCode: 'essential',
        cycle: 'monthly',
        coverageStart: midnightUtc(start),
        coverageEnd: midnightUtc(coverageEnd(start, 'monthly')),
      },
    })
  })

  it('shows the server error when the email is already used', async () => {
    setup(apiError(409, 'EMAIL_TAKEN'))
    await screen.findByRole('button', { name: 'Create customer' })
    fillIdentity()
    fill('Reason (internal)', 'Sales call')
    fireEvent.click(screen.getByRole('button', { name: 'Create customer' }))
    expect(await screen.findByText('server EMAIL_TAKEN')).toBeInTheDocument()
  })
})

describe('coverage period', () => {
  it('clamps month ends and adds whole years', () => {
    expect(coverageEnd('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(coverageEnd('2026-10-15', 'monthly')).toBe('2026-11-15')
    expect(coverageEnd('2027-12-31', 'monthly')).toBe('2028-01-31')
    expect(coverageEnd('2026-10-15', 'annual')).toBe('2027-10-15')
    expect(coverageEnd('2028-02-29', 'annual')).toBe('2029-02-28')
  })
})
