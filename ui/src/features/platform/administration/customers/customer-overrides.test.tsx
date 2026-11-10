import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import i18n from '../../../../lib/i18n'
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
import { AdminCustomerDetailPage } from './pages/customer-detail-page'

useAdminTestLifecycle()

const overridesUrl = `/api/v1/admin/owners/${ownerId}/entitlement-overrides`
const record = (over: Record<string, unknown> = {}) => ({
  id: '55555555-5555-4555-8555-555555555555',
  entitlementKey: 'staffPerOrganization',
  booleanValue: null,
  integerValue: 8,
  unlimited: false,
  startsAt: '2026-10-01T00:00:00Z',
  endsAt: '2026-12-01T00:00:00Z',
  reason: 'Seasonal team',
  createdBy: 'root@example.test',
  createdAt: '2026-10-01T00:00:00Z',
  revokedAt: null,
  revokedBy: null,
  revocationReason: null,
  replacesId: null,
  state: 'active',
  timezone: 'Africa/Casablanca',
  ...over,
})
const detail = ownerDetail({
  subscription: {
    ...ownerDetail().subscription,
    entitlements: { ...ownerDetail().subscription.entitlements, staffPerOrganization: 8 },
    entitlementSources: [
      {
        entitlementKey: 'staffPerOrganization',
        source: 'override',
        effectiveUntil: '2026-12-01T00:00:00Z',
      },
      { entitlementKey: 'organizations', source: 'plan', effectiveUntil: null },
    ],
  },
})

function setup(items: unknown[] = [record()], post?: (key: string) => unknown) {
  mockApi((key) => {
    if (key === 'GET /api/v1/admin/auth/me') return { body: session }
    if (key === `GET /api/v1/admin/owners/${ownerId}`) return { body: detail }
    if (key === `GET ${overridesUrl}`) return { body: { items } }
    if (key.startsWith('POST ')) return (post?.(key) as never) ?? { status: 201, body: record() }
  })
  renderAt(`/customers/${ownerId}`, <AdminCustomerDetailPage customerId={ownerId} />)
}
const posts = () => calls.filter((call) => call.method === 'POST')

describe('customer plan exceptions', () => {
  it('shows each effective value with its origin and the reviewable history', async () => {
    setup([
      record(),
      record({
        id: '66666666-6666-4666-8666-666666666666',
        state: 'revoked',
        revokedAt: '2026-10-05T00:00:00Z',
        revokedBy: 'root@example.test',
        revocationReason: 'Mistake',
      }),
    ])
    const staff = await screen.findByTestId('effective-staffPerOrganization')
    expect(staff).toHaveTextContent('8')
    expect(staff).toHaveTextContent(/Override until/)
    expect(screen.getByTestId('effective-organizations')).toHaveTextContent('Plan')
    expect(await screen.findAllByText('Seasonal team')).toHaveLength(2)
    expect(screen.getByText(/Mistake/)).toBeInTheDocument()
    // Only the active record can be revoked or amended.
    expect(screen.getAllByRole('button', { name: 'Revoke' })).toHaveLength(1)
  })

  it('creates an override only with a valid value and reason, without a code', async () => {
    setup([])
    fireEvent.click(await screen.findByRole('button', { name: 'Add override' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('New limit'), { target: { value: '-2' } })
    expect(within(dialog).getByRole('alert')).toHaveTextContent(
      'Enter a whole number of at least 0.',
    )
    fireEvent.change(within(dialog).getByLabelText('New limit'), { target: { value: '7' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add override' }))
    expect(
      await within(dialog).findByText('Indicate the reason for this action.'),
    ).toBeInTheDocument()
    expect(posts()).toHaveLength(0)
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), {
      target: { value: 'Pilot' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add override' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(within(dialog).queryByLabelText('Authenticator code')).toBeNull()
    expect(posts()[0]!.data).not.toHaveProperty('code')
    expect(posts()[0]).toMatchObject({
      url: overridesUrl,
      data: {
        entitlementKey: 'staffPerOrganization',
        integerValue: 7,
        booleanValue: null,
        unlimited: false,
        startsOn: null,
        endsOn: null,
        replacesId: null,
        reason: 'Pilot',
      },
    })
  })

  it('keeps the dialog open and explains an overlap refused by the server', async () => {
    setup([], () => apiError(409, 'OVERRIDE_OVERLAP'))
    fireEvent.click(await screen.findByRole('button', { name: 'Add override' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('New limit'), { target: { value: '3' } })
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add override' }))
    expect(await within(dialog).findByText(/OVERRIDE_OVERLAP|server/)).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('revokes with a reason only on the owner-scoped route', async () => {
    setup()
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), {
      target: { value: 'Ended' },
    })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke override' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]).toMatchObject({
      url: `${overridesUrl}/55555555-5555-4555-8555-555555555555/revoke`,
      data: { reason: 'Ended' },
    })
  })

  it('sends plain calendar days for the API to interpret in the customer timezone', async () => {
    setup([])
    fireEvent.click(await screen.findByRole('button', { name: 'Add override' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Starts'), { target: { value: '2026-11-09' } })
    fireEvent.change(within(dialog).getByLabelText('Ends'), { target: { value: '2026-12-01' } })
    fireEvent.change(within(dialog).getByLabelText('New limit'), { target: { value: '4' } })
    fireEvent.change(within(dialog).getByLabelText('Reason (internal)'), { target: { value: 'x' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add override' }))
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]!.data).toMatchObject({ startsOn: '2026-11-09', endsOn: '2026-12-01' })
    expect(posts()[0]!.data).not.toHaveProperty('startsAt')
    expect(posts()[0]!.data).not.toHaveProperty('code')
  })
})

describe('override history in French', () => {
  it('translates the empty override history', async () => {
    await i18n.changeLanguage('fr')
    try {
      setup([])
      expect(await screen.findByText('Aucune exception')).toBeInTheDocument()
      expect(screen.getByText('Ce client utilise les valeurs de son offre.')).toBeInTheDocument()
      expect(screen.queryByText('No override')).toBeNull()
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
