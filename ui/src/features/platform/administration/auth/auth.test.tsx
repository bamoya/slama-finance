import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  apiError,
  calls,
  mockApi,
  renderAt,
  session,
  useAdminTestLifecycle,
} from '../shared/api-mock'
import { AdminSignInPage } from './pages/sign-in-page'

const webauthn = vi.hoisted(() => ({
  supported: true,
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}))
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => webauthn.supported,
  startAuthentication: webauthn.startAuthentication,
  startRegistration: webauthn.startRegistration,
}))

useAdminTestLifecycle()
beforeEach(() => {
  webauthn.supported = true
  webauthn.startAuthentication.mockReset()
})

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
      if (key === 'POST /api/v1/admin/auth/login')
        return {
          body: {
            step: 'enroll',
            enrollment: { otpauthUri: 'otpauth://totp/Slama:root?secret=ABCDEF', secret: 'ABCDEF' },
          },
        }
      if (key === 'POST /api/v1/admin/auth/2fa') return { body: session }
    })
    renderAt('/login', <AdminSignInPage />)
    await signIn()
    expect(await screen.findByRole('img', { name: 'Authenticator QR code' })).toBeInTheDocument()
    expect(screen.getByText('ABCDEF')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'))
    expect(calls.find((call) => call.url === '/api/v1/admin/auth/2fa')?.data).toEqual({
      code: '123456',
    })
    expect(calls.every((call) => call.url?.startsWith('/api/v1/admin/'))).toBe(true)
  })

  it('verifies without a QR code, keeps the form on a wrong code and restarts when the session is killed', async () => {
    let attempts = 0
    mockApi((key) => {
      if (key === 'POST /api/v1/admin/auth/login')
        return { body: { step: 'verify', enrollment: null } }
      if (key === 'POST /api/v1/admin/auth/2fa')
        return apiError(401, ++attempts < 2 ? 'INVALID_CODE' : 'UNAUTHENTICATED')
    })
    renderAt('/login', <AdminSignInPage />)
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
    renderAt('/login', <AdminSignInPage />)
    await signIn('12ab')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(calls.some((call) => call.url === '/api/v1/admin/auth/2fa')).toBe(false)
  })
})

const challengeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const options = { challenge: 'abc', rpId: 'admin.example.test', userVerification: 'required' }
const assertion = { id: 'cred-1', response: { signature: 'sig' }, type: 'public-key' }

describe('passkey sign-in', () => {
  const passkeyApi = (verify?: { status?: number; body?: unknown }) =>
    mockApi((key) => {
      if (key === 'POST /api/v1/admin/auth/passkey/options')
        return { body: { challengeId, optionsJSON: options } }
      if (key === 'POST /api/v1/admin/auth/passkey') return verify ?? { body: session }
    })

  it('signs in with a passkey without any additional authenticator code', async () => {
    webauthn.startAuthentication.mockResolvedValue(assertion)
    passkeyApi()
    renderAt('/login', <AdminSignInPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'))
    expect(webauthn.startAuthentication).toHaveBeenCalledWith({ optionsJSON: options })
    expect(calls.find((call) => call.url === '/api/v1/admin/auth/passkey')?.data).toEqual({
      challengeId,
      credential: assertion,
    })
    expect(calls.some((call) => call.url === '/api/v1/admin/auth/2fa')).toBe(false)
    expect(screen.queryByLabelText('Verification code')).not.toBeInTheDocument()
  })

  it('explains a cancelled prompt and stays on the sign-in form', async () => {
    webauthn.startAuthentication.mockRejectedValue(
      Object.assign(new Error('x'), { name: 'NotAllowedError' }),
    )
    passkeyApi()
    renderAt('/login', <AdminSignInPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Passkey request cancelled.')
    expect(calls.some((call) => call.url === '/api/v1/admin/auth/passkey')).toBe(false)
    expect(screen.getByLabelText('Email address')).toBeInTheDocument()
  })

  it('shows a friendly message when the server rejects the assertion', async () => {
    webauthn.startAuthentication.mockResolvedValue(assertion)
    passkeyApi(apiError(401, 'INVALID_CREDENTIALS'))
    renderAt('/login', <AdminSignInPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Sign in with a passkey' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This passkey was not accepted.')
    expect(screen.getByTestId('location')).not.toHaveTextContent('/overview')
  })

  it('hides the passkey button when the browser has no WebAuthn support', async () => {
    webauthn.supported = false
    passkeyApi()
    renderAt('/login', <AdminSignInPage />)
    await screen.findByLabelText('Email address')
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).not.toBeInTheDocument()
  })

  it('keeps password and authenticator sign-in as the fallback', async () => {
    mockApi((key) => {
      if (key === 'POST /api/v1/admin/auth/login')
        return { body: { step: 'verify', enrollment: null } }
      if (key === 'POST /api/v1/admin/auth/2fa') return { body: session }
    })
    renderAt('/login', <AdminSignInPage />)
    await signIn()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'))
    expect(calls.some((call) => call.url?.includes('/passkey'))).toBe(false)
  })
})

describe('recovery code sign-in', () => {
  const toRecovery = async () => {
    fireEvent.change(await screen.findByLabelText('Email address'), {
      target: { value: 'root@example.test' },
    })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'correct horse' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Use a recovery code' }))
  }

  it('signs in with a recovery code from the pending step', async () => {
    mockApi((key) => {
      if (key === 'POST /api/v1/admin/auth/login')
        return { body: { step: 'verify', enrollment: null } }
      if (key === 'POST /api/v1/admin/auth/recovery') return { body: session }
    })
    renderAt('/login', <AdminSignInPage />)
    await toRecovery()
    fireEvent.change(screen.getByLabelText('Recovery code'), {
      target: { value: 'ABCD-EFGH-JKLM-NPQR' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with this code' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/'))
    expect(calls.find((call) => call.url === '/api/v1/admin/auth/recovery')?.data).toEqual({
      recoveryCode: 'ABCD-EFGH-JKLM-NPQR',
    })
  })

  it('clears a refused code, then restarts when the pending session is revoked', async () => {
    let attempts = 0
    mockApi((key) => {
      if (key === 'POST /api/v1/admin/auth/login')
        return { body: { step: 'verify', enrollment: null } }
      if (key === 'POST /api/v1/admin/auth/recovery')
        return apiError(401, ++attempts < 2 ? 'INVALID_CODE' : 'UNAUTHENTICATED')
    })
    renderAt('/login', <AdminSignInPage />)
    await toRecovery()
    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'WRONG' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with this code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('server INVALID_CODE')
    expect(screen.getByLabelText('Recovery code')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Recovery code'), { target: { value: 'WRONG-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with this code' }))
    expect(await screen.findByLabelText('Email address')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Log in again')
  })

  it('rejects an empty code locally', async () => {
    mockApi(() => ({ body: { step: 'verify', enrollment: null } }))
    renderAt('/login', <AdminSignInPage />)
    await toRecovery()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in with this code' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(calls.some((call) => call.url === '/api/v1/admin/auth/recovery')).toBe(false)
  })
})
