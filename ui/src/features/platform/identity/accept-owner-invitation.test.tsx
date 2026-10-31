import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { httpClient } from '../../../api/http'
import { AcceptOwnerInvitationPage } from './pages/accept-owner-invitation-page'
import { OwnerAuthPage } from './pages/owner-auth-page'

const token = 'A'.repeat(43)
const invitation = {
  email: 'sara@example.test',
  firstName: 'Sara',
  lastName: 'Alaoui',
  locale: 'fr',
}
const clients: QueryClient[] = []

function reply(data: unknown, status = 200) {
  return { data: status === 204 ? '' : JSON.stringify(data), status, headers: {} } as never
}

function setup(hash: string) {
  window.history.replaceState({}, '', `/auth/accept-invitation${hash}`)
  const location = memoryLocation({ path: '/auth/accept-invitation', record: true })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook} searchHook={location.searchHook}>
        <AcceptOwnerInvitationPage />
      </Router>
    </QueryClientProvider>,
  )
  return location
}

beforeEach(() => vi.restoreAllMocks())
afterEach(() => clients.splice(0).forEach((client) => client.clear()))

describe('owner invitation acceptance', () => {
  it('greets the invitee, hides the token and activates the account', async () => {
    const request = vi
      .spyOn(httpClient, 'request')
      .mockImplementation(async (config) =>
        config.url?.endsWith('/inspect') ? reply(invitation) : reply(undefined, 204),
      )
    const location = setup(`#token=${token}`)
    expect(await screen.findByRole('heading', { name: 'Welcome Sara' })).toBeInTheDocument()
    expect(window.location.hash).toBe('')
    expect(request.mock.calls[0]?.[0]).toMatchObject({
      url: '/v1/owner-auth/invitation/inspect',
      data: { token },
    })
    expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly')
    expect(screen.getByLabelText('Email address')).toHaveValue('sara@example.test')

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } })
    fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: 'short' } })
    fireEvent.click(screen.getByRole('button', { name: 'Activate account' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(request).toHaveBeenCalledTimes(1)

    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'a-long-password-2026' },
    })
    fireEvent.change(screen.getByLabelText('Confirm password'), {
      target: { value: 'a-long-password-2026' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Activate account' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/auth/login?invitation=accepted'))
    expect(request.mock.calls.at(-1)?.[0]).toMatchObject({
      url: '/v1/owner-auth/invitation/accept',
      data: { token, password: 'a-long-password-2026' },
    })
  })

  it('shows a clear message and no form for an invalid or expired token', async () => {
    vi.spyOn(httpClient, 'request').mockResolvedValue(
      reply({ code: 'INVALID_INVITATION_TOKEN', message: 'Invalid token' }, 400),
    )
    setup(`#token=${token}`)
    expect(await screen.findByText('This invitation link is not valid.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Activate account' })).toBeNull()
  })

  it('rejects a missing token without calling the API', async () => {
    const request = vi.spyOn(httpClient, 'request')
    setup('')
    expect(await screen.findByText('This invitation link is not valid.')).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
  })

  it('tells the owner their account is active on the sign-in page', () => {
    const location = memoryLocation({ path: '/auth/login?invitation=accepted' })
    const client = new QueryClient()
    clients.push(client)
    render(
      <QueryClientProvider client={client}>
        <Router hook={location.hook} searchHook={location.searchHook}>
          <OwnerAuthPage mode="login" />
        </Router>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Your account is active')
  })
})
