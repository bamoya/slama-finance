import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  apiError,
  calls,
  mockApi,
  renderAt,
  session,
  useAdminTestLifecycle,
} from '../shared/api-mock'
import { AdminSecurityPage } from './pages/security-page'

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

const challengeId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const passkeyId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const options = { challenge: 'abc', userVerification: 'required' }
const registration = { id: 'cred-2', response: { attestationObject: 'x' }, type: 'public-key' }
const codes = Array.from({ length: 10 }, (_, i) => `AAAA-BBBB-CCCC-DD${String(i).padStart(2, '0')}`)
const passkey = {
  id: passkeyId,
  name: 'Work laptop',
  createdAt: '2026-10-01T09:00:00Z',
  lastUsedAt: null,
  backedUp: false,
}
const security = (passkeys: unknown[] = [passkey]) => ({
  totpEnrolled: true,
  passkeys,
  recoveryCodesRemaining: 3,
  reauthenticatedUntil: null,
})

type Reply = { status?: number; body?: unknown } | undefined
function setup(
  handler: (key: string, count: number) => Reply = () => undefined,
  passkeys?: unknown[],
) {
  const counts: Record<string, number> = {}
  mockApi((key) => {
    counts[key] = (counts[key] ?? 0) + 1
    if (key === 'GET /api/v1/admin/auth/me') return { body: session }
    const custom = handler(key, counts[key]!)
    if (custom) return custom
    if (key === 'GET /api/v1/admin/security') return { body: security(passkeys) }
    if (key === 'POST /api/v1/admin/auth/reauthentication')
      return { body: { reauthenticatedUntil: '2026-11-10T10:05:00Z' } }
    if (key === 'POST /api/v1/admin/auth/reauthentication/options')
      return { body: { challengeId, optionsJSON: options } }
    if (key === 'POST /api/v1/admin/security/passkeys/options')
      return { body: { challengeId, optionsJSON: options } }
    if (key === 'POST /api/v1/admin/security/passkeys')
      return { status: 201, body: { ...passkey, name: 'Phone' } }
    if (key === 'POST /api/v1/admin/security/recovery-codes') return { body: { codes } }
    if (key === 'POST /api/v1/admin/security/totp')
      return { body: { otpauthUri: 'otpauth://totp/x?secret=NEWSECRET', secret: 'NEWSECRET' } }
    if (key.startsWith('DELETE ') || key === 'POST /api/v1/admin/security/totp/confirm')
      return { status: 204 }
  })
  renderAt('/security', <AdminSecurityPage />)
}
const called = (url: string) => calls.filter((call) => call.url === `/api/v1/admin/${url}`)
const reauthWithPassword = async (password = 'correct horse', code = '123456') => {
  const dialog = await screen.findByRole('dialog', { name: 'Confirm it is you' })
  fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: password } })
  fireEvent.change(within(dialog).getByLabelText('Authenticator code'), { target: { value: code } })
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  return dialog
}

beforeEach(() => {
  webauthn.supported = true
  webauthn.startAuthentication.mockReset().mockResolvedValue({ id: 'cred-1' })
  webauthn.startRegistration.mockReset().mockResolvedValue(registration)
})

describe('administrator security page', () => {
  it('lists own named passkeys and the recovery code count', async () => {
    setup()
    const list = await screen.findByRole('list', { name: 'Passkeys' })
    expect(within(list).getByText('Work laptop')).toBeInTheDocument()
    expect(screen.getByText(/Remaining: 3/)).toBeInTheDocument()
  })

  it('adds a named passkey after reauthenticating with password and code, retrying once', async () => {
    setup((key, count) =>
      key === 'POST /api/v1/admin/security/passkeys/options' && count === 1
        ? apiError(403, 'REAUTHENTICATION_REQUIRED')
        : undefined,
    )
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: 'Phone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }))
    await reauthWithPassword()
    await waitFor(() => expect(called('security/passkeys')).toHaveLength(1))
    expect(called('auth/reauthentication')[0]!.data).toEqual({
      method: 'password_totp',
      password: 'correct horse',
      code: '123456',
    })
    expect(webauthn.startRegistration).toHaveBeenCalledWith({ optionsJSON: options })
    expect(called('security/passkeys')[0]!.data).toEqual({
      challengeId,
      name: 'Phone',
      credential: registration,
    })
    expect(called('security/passkeys/options')).toHaveLength(2)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('requires a name before opening the device prompt', async () => {
    setup()
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Give this passkey a name')
    expect(called('security/passkeys/options')).toHaveLength(0)
    expect(webauthn.startRegistration).not.toHaveBeenCalled()
  })

  it('retries only once: a second refusal is reported without prompting again', async () => {
    setup((key) =>
      key === 'POST /api/v1/admin/security/recovery-codes'
        ? apiError(403, 'REAUTHENTICATION_REQUIRED')
        : undefined,
    )
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }))
    await reauthWithPassword()
    await waitFor(() => expect(called('security/recovery-codes')).toHaveLength(2))
    expect(await screen.findByText('server REAUTHENTICATION_REQUIRED')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(called('auth/reauthentication')).toHaveLength(1)
  })

  it('offers passkey reauthentication only when the administrator has passkeys', async () => {
    setup(
      (key, count) =>
        key === 'POST /api/v1/admin/security/recovery-codes' && count === 1
          ? apiError(403, 'REAUTHENTICATION_REQUIRED')
          : undefined,
      [],
    )
    await screen.findByText('No passkey registered yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirm it is you' })
    expect(within(dialog).queryByRole('button', { name: 'Confirm with a passkey' })).toBeNull()
    expect(within(dialog).getByLabelText('Password')).toBeInTheDocument()
  })

  it('reauthenticates with a passkey when one exists', async () => {
    setup((key, count) =>
      key === 'POST /api/v1/admin/security/recovery-codes' && count === 1
        ? apiError(403, 'REAUTHENTICATION_REQUIRED')
        : undefined,
    )
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm with a passkey' }))
    await screen.findByRole('dialog', { name: 'Your recovery codes' })
    expect(webauthn.startAuthentication).toHaveBeenCalledWith({ optionsJSON: options })
    expect(called('auth/reauthentication')[0]!.data).toEqual({
      method: 'passkey',
      challengeId,
      credential: { id: 'cred-1' },
    })
  })

  it('keeps the dialog on a wrong password and clears the typed secrets', async () => {
    setup((key, count) => {
      if (key === 'POST /api/v1/admin/security/recovery-codes' && count === 1)
        return apiError(403, 'REAUTHENTICATION_REQUIRED')
      if (key === 'POST /api/v1/admin/auth/reauthentication')
        return apiError(401, 'REAUTHENTICATION_FAILED')
    })
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }))
    const dialog = await reauthWithPassword('wrong', '000000')
    expect(await within(dialog).findByText('server REAUTHENTICATION_FAILED')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Password')).toHaveValue('')
    expect(within(dialog).getByLabelText('Authenticator code')).toHaveValue('')
    expect(screen.getByTestId('location')).toHaveTextContent('/security')
    expect(called('security/recovery-codes')).toHaveLength(1)
  })

  it('cancels reauthentication without retrying the change', async () => {
    setup((key) =>
      key === 'POST /api/v1/admin/security/recovery-codes'
        ? apiError(403, 'REAUTHENTICATION_REQUIRED')
        : undefined,
    )
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Confirm it is you' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(called('security/recovery-codes')).toHaveLength(1)
    expect(called('auth/reauthentication')).toHaveLength(0)
  })

  it('shows new recovery codes once and drops them on close', async () => {
    setup()
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }))
    const dialog = await screen.findByRole('dialog', { name: 'Your recovery codes' })
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(10)
    expect(within(dialog).getByText(codes[0]!)).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'I have saved these codes' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText(codes[0]!)).not.toBeInTheDocument()
    expect(JSON.stringify({ ...localStorage })).not.toContain(codes[0]!)
  })

  it('removes a passkey only after confirmation', async () => {
    setup()
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Work laptop' }))
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false)
    const dialog = await screen.findByRole('dialog', { name: 'Remove this passkey?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove' }))
    await waitFor(() =>
      expect(calls.find((call) => call.method === 'DELETE')?.url).toBe(
        `/api/v1/admin/security/passkeys/${passkeyId}`,
      ),
    )
  })

  it('replaces the authenticator app: enrollment, then confirmation with a code', async () => {
    setup((key, count) =>
      key === 'POST /api/v1/admin/security/totp' && count === 1
        ? apiError(403, 'REAUTHENTICATION_REQUIRED')
        : undefined,
    )
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Replace authenticator app' }))
    await reauthWithPassword()
    expect(await screen.findByText('NEWSECRET')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await waitFor(() => expect(called('security/totp/confirm')).toHaveLength(1))
    expect(called('security/totp/confirm')[0]!.data).toEqual({ code: '654321' })
    expect(await screen.findByRole('status')).toHaveTextContent('Authenticator app replaced')
    expect(screen.queryByText('NEWSECRET')).not.toBeInTheDocument()
  })

  it('explains a cancelled device prompt and keeps the list unchanged', async () => {
    setup()
    webauthn.startRegistration.mockRejectedValue(
      Object.assign(new Error('x'), { name: 'NotAllowedError' }),
    )
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.change(screen.getByLabelText('Passkey name'), { target: { value: 'Phone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add a passkey' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Passkey request cancelled.')
    expect(called('security/passkeys')).toHaveLength(0)
  })

  it('says so when the browser has no passkey support', async () => {
    webauthn.supported = false
    setup()
    await screen.findByRole('list', { name: 'Passkeys' })
    expect(screen.getByText('Passkeys are not supported by this browser.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument()
  })

  it('signs out and drops the new secret when the session is gone on the retried change', async () => {
    setup((key, count) =>
      key === 'POST /api/v1/admin/security/totp/confirm'
        ? count === 1
          ? apiError(403, 'REAUTHENTICATION_REQUIRED')
          : apiError(401, 'UNAUTHENTICATED')
        : undefined,
    )
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Replace authenticator app' }))
    expect(await screen.findByText('NEWSECRET')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: '654321' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verify' }))
    await reauthWithPassword()
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
    expect(called('auth/reauthentication')).toHaveLength(1)
    expect(called('security/totp/confirm')).toHaveLength(2)
    expect(screen.queryByText('NEWSECRET')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('signs out when the session is gone during a change', async () => {
    setup((key) =>
      key === 'POST /api/v1/admin/security/recovery-codes'
        ? apiError(401, 'UNAUTHENTICATED')
        : undefined,
    )
    await screen.findByRole('list', { name: 'Passkeys' })
    fireEvent.click(screen.getByRole('button', { name: 'Generate new codes' }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login'))
  })
})
