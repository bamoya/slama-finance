import { fireEvent, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import {
  apiError,
  calls,
  mockApi,
  renderAt,
  session,
  useAdminTestLifecycle,
} from '../shared/api-mock'
import { AdminSignInPage } from './pages/sign-in-page'

useAdminTestLifecycle()

async function signIn(code = '123456') {
  fireEvent.change(await screen.findByLabelText('Email address'), {
    target: { value: 'root@example.test' },
  })
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
  fireEvent.change(await screen.findByLabelText('Verification code'), { target: { value: code } })
  fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
}

describe('admin login and two-factor flow', () => {
  it('shows a locally rendered QR code and manual secret on enrollment, then signs in', async () => {
    mockApi((key) => {
      if (key === 'POST /v1/admin/auth/login')
        return {
          body: {
            step: 'enroll',
            enrollment: { otpauthUri: 'otpauth://totp/Slama:root?secret=ABCDEF', secret: 'ABCDEF' },
          },
        }
      if (key === 'POST /v1/admin/auth/2fa') return { body: session }
    })
    renderAt('/admin/login', <AdminSignInPage />)
    await signIn()
    expect(await screen.findByRole('img', { name: 'Authenticator QR code' })).toBeInTheDocument()
    expect(screen.getByText('ABCDEF')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/admin/payments'))
    expect(calls.find((call) => call.url === '/v1/admin/auth/2fa')?.data).toEqual({
      code: '123456',
    })
    expect(calls.every((call) => call.url?.startsWith('/v1/admin/'))).toBe(true)
  })

  it('verifies without a QR code, keeps the form on a wrong code and restarts when the session is killed', async () => {
    let attempts = 0
    mockApi((key) => {
      if (key === 'POST /v1/admin/auth/login') return { body: { step: 'verify', enrollment: null } }
      if (key === 'POST /v1/admin/auth/2fa')
        return apiError(401, ++attempts < 2 ? 'INVALID_CODE' : 'UNAUTHENTICATED')
    })
    renderAt('/admin/login', <AdminSignInPage />)
    await signIn('000000')
    expect(screen.queryByRole('img', { name: 'Authenticator QR code' })).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('server INVALID_CODE')
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '111111' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Log in again')
  })

  it('rejects a malformed code locally', async () => {
    mockApi(() => ({ body: { step: 'verify', enrollment: null } }))
    renderAt('/admin/login', <AdminSignInPage />)
    await signIn('12ab')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(calls.some((call) => call.url === '/v1/admin/auth/2fa')).toBe(false)
  })
})
