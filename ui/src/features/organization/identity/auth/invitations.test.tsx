import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { httpClient } from '../../../../api/http'
import { AcceptInvitationPage } from './pages/accept-invitation-page'

const organizationId = '33333333-3333-4333-8333-333333333333',
  token = 'a'.repeat(43)
let client: QueryClient
const response = (data: unknown, status = 200) =>
  ({ data: JSON.stringify(data), status, headers: {} }) as never
function setup() {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const location = memoryLocation({ path: `/organizations/${organizationId}/accept-invitation` })
  return render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <AcceptInvitationPage organizationId={organizationId} />
      </Router>
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(
    {},
    '',
    `/organizations/${organizationId}/accept-invitation#token=${token}`,
  )
})
afterEach(() => {
  client?.clear()
  window.history.replaceState({}, '', '/')
})
describe('Organization invitation acceptance', () => {
  it('removes the token fragment and accepts through generated organization endpoints without signing in', async () => {
    const request = vi.spyOn(httpClient, 'request').mockImplementation(async (config) =>
      response(
        config.url?.endsWith('/inspect')
          ? {
              organizationName: 'Atlas',
              email: 'sara@example.test',
              expiresAt: '2026-11-02T12:00:00Z',
            }
          : {
              organizationId,
              email: 'sara@example.test',
              message: 'Sign in to your organization.',
            },
      ),
    )
    setup()
    await screen.findByText('sara@example.test')
    expect(window.location.hash).toBe('')
    const fill = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    fill('First name', 'Sara')
    fill('Family name', 'Amrani')
    fill('New password', 'invitation-password-2026')
    fill('Confirm password', 'invitation-password-2026')
    fireEvent.click(screen.getByRole('button', { name: 'Accept invitation' }))
    await screen.findByText('Your password is saved. Sign in to your organization.')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `/v1/organizations/${organizationId}/auth/invitations/accept`,
        data: {
          token,
          firstName: 'Sara',
          lastName: 'Amrani',
          password: 'invitation-password-2026',
        },
      }),
    )
    expect(
      request.mock.calls.some(([config]) => /owner-auth|\/login$/.test(config.url ?? '')),
    ).toBe(false)
    expect(screen.getByRole('link', { name: 'Sign in to your organization' })).toHaveAttribute(
      'href',
      `/organizations/${organizationId}/login`,
    )
  })
  it('shows expired invitations safely and does not show an acceptance form', async () => {
    vi.spyOn(httpClient, 'request').mockResolvedValue(
      response({ code: 'INVITATION_EXPIRED', message: 'This invitation has expired.' }, 410),
    )
    setup()
    await screen.findByRole('alert')
    expect(screen.queryByRole('button', { name: 'Accept invitation' })).not.toBeInTheDocument()
  })
  it('rejects missing tokens without an API call', async () => {
    window.history.replaceState({}, '', '/')
    const request = vi.spyOn(httpClient, 'request')
    setup()
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('This invitation link is invalid.'),
    )
    expect(request).not.toHaveBeenCalled()
  })
})
