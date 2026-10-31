import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { getGetOwnerSessionQueryKey } from '../../../api/generated/identity/identity'
import { httpClient } from '../../../api/http'
import { OwnerAccountPage } from './pages/owner-account-page'
import { OwnerAuthPage } from './pages/owner-auth-page'

const owner = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'owner@example.test',
  firstName: null,
  lastName: null,
  locale: 'fr',
}
const clients: QueryClient[] = []
function setup(mode: Parameters<typeof OwnerAuthPage>[0]['mode'] | 'account') {
  const location = memoryLocation({ path: '/owner/login', record: true })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        {mode === 'account' ? <OwnerAccountPage /> : <OwnerAuthPage mode={mode} />}
      </Router>
    </QueryClientProvider>,
  )
  return { client, location }
}
function response(data: unknown, status = 200) {
  return { data: JSON.stringify(data), status, headers: {} } as never
}
beforeEach(() => {
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
})
afterEach(() => {
  clients.splice(0).forEach((c) => c.clear())
})
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('Generated owner authentication UI', () => {
  it('signs in through the generated endpoint and stores only the owner session', async () => {
    const request = vi.spyOn(httpClient, 'request').mockResolvedValue(response({ owner }))
    const { client, location } = setup('login')
    fill('Email address', 'owner@example.test')
    fill('Password', 'owner-password-2026')
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text')
    expect(request).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(screen.getByLabelText('Password')).toHaveValue('owner-password-2026')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/owner'))
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/v1/owner-auth/login',
        data: { email: 'owner@example.test', password: 'owner-password-2026' },
      }),
    )
    expect(client.getQueryData(getGetOwnerSessionQueryKey())).toEqual({ owner })
    expect(client.getQueryData(['session'])).toBeUndefined()
  })

  it('validates confirmation and sends registration with the selected language', async () => {
    const request = vi
      .spyOn(httpClient, 'request')
      .mockResolvedValue(response({ message: 'accepted' }, 202))
    setup('register')
    fill('Email address', 'new@example.test')
    fill('First name', 'Amel')
    fill('Last name', 'Ben Salah')
    fill('Password', 'owner-password-2026')
    // Shared AuthForm confirmation remains client-only.
    fill('Confirm password', 'different-password-2026')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()
    fill('Confirm password', 'owner-password-2026')
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('If the account is eligible')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/v1/owner-auth/register',
        data: {
          email: 'new@example.test',
          password: 'owner-password-2026',
          firstName: 'Amel',
          lastName: 'Ben Salah',
          locale: 'en',
        },
      }),
    )
  })

  it('requires an explicit verification action and removes the secret fragment', async () => {
    const raw = 'A'.repeat(43)
    window.history.replaceState({}, '', `/owner/verify-email#token=${raw}`)
    const request = vi.spyOn(httpClient, 'request').mockResolvedValue(response(undefined, 204))
    setup('verify')
    expect(window.location.hash).toBe('')
    expect(request).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Email verified')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/v1/owner-auth/verification/confirm', data: { token: raw } }),
    )
  })

  it('does not clear staff authentication when owner authentication is rejected', async () => {
    const expired = vi.fn()
    window.addEventListener('slama:session-expired', expired)
    try {
      vi.spyOn(httpClient, 'request').mockResolvedValue(
        response({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' }, 401),
      )
      setup('login')
      fill('Email address', 'owner@example.test')
      fill('Password', 'wrong-password')
      fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
      expect(expired).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('slama:session-expired', expired)
    }
  })

  it('shows account data and signs out using the owner endpoint only', async () => {
    const request = vi
      .spyOn(httpClient, 'request')
      .mockImplementation(async (config) =>
        config.url === '/v1/owner-auth/session' ? response({ owner }) : response(undefined, 204),
      )
    const { location } = setup('account')
    expect(await screen.findByText('owner@example.test')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/owner/login'))
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ url: '/v1/owner-auth/logout' }))
  })
})
