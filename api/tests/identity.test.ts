import { describe, expect, it, vi } from 'vitest'

import type { Transaction } from '../src/lib/db.js'
import { toSession } from '../src/modules/identity/auth/mappers/auth.mapper.js'
import { createAuthService } from '../src/modules/identity/auth/services/auth.service.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { createSessionService } from '../src/modules/identity/auth/services/session.service.js'

const user = {
  id: 'user-id',
  email: 'staff@example.test',
  firstName: 'Sara',
  lastName: 'Amrani',
  avatarUrl: null,
  archivedAt: null,
  mustChangePassword: false,
  temporaryPasswordExpiresAt: null,
  temporaryPasswordConsumedAt: null,
  passwordChangedAt: null,
  passwordHash: 'secret',
  disabledAt: null,
  emailVerifiedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}
describe('identity services', () => {
  it('updates only the signed-in profile after password verification', async () => {
    const repository = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      lock: vi.fn(),
      consumeTemporary: vi.fn(),
      changePassword: vi.fn(),
      updateProfile: vi.fn().mockResolvedValue(user),
      transaction: async <T>(work: (tx: Transaction) => Promise<T>) => work({} as Transaction),
    }
    const passwords = { hash: vi.fn(), verify: vi.fn().mockResolvedValue(true) }
    const sessions = {
      issue: vi.fn(),
      inspect: vi.fn().mockResolvedValue({ user, purpose: 'full' }),
      resolve: vi.fn(),
      revoke: vi.fn(),
    }
    const service = createAuthService(repository, passwords, sessions)
    const input = {
      firstName: ' Sara ',
      lastName: ' Amrani ',
      email: 'SARA@example.test',
      currentPassword: 'secret',
    }
    await service.updateProfile('token', input)
    expect(repository.updateProfile).toHaveBeenCalledWith(
      user.id,
      { firstName: 'Sara', lastName: 'Amrani', email: 'sara@example.test' },
      expect.anything(),
    )
    repository.updateProfile.mockClear()
    passwords.verify.mockResolvedValue(false)
    await expect(service.updateProfile('token', input)).rejects.toMatchObject({
      code: 'INVALID_CURRENT_PASSWORD',
    })
    sessions.inspect.mockResolvedValue({ user, purpose: 'password_change' })
    await expect(service.updateProfile('token', input)).rejects.toMatchObject({
      code: 'PASSWORD_CHANGE_REQUIRED',
    })
    sessions.inspect.mockResolvedValue(null)
    await expect(service.updateProfile(undefined, input)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    })
    expect(repository.updateProfile).not.toHaveBeenCalled()
  })
  it('hashes passwords and safely rejects incorrect or malformed hashes', async () => {
    const passwords = createPasswordService()
    const hash = await passwords.hash('correct-password')
    expect(hash).not.toContain('correct-password')
    expect(await passwords.verify('correct-password', hash)).toBe(true)
    expect(await passwords.verify('wrong-password', hash)).toBe(false)
    expect(await passwords.verify('password', 'salt:bad')).toBe(false)
  })
  it('normalizes login email and only issues sessions for valid active users', async () => {
    const repository = {
      findByEmail: vi.fn().mockResolvedValue(user),
      findById: vi.fn().mockResolvedValue(user),
      transaction: async <T>(work: (tx: Transaction) => Promise<T>) => work({} as Transaction),
      lock: vi.fn(),
      consumeTemporary: vi.fn(),
      changePassword: vi.fn(),
      updateProfile: vi.fn(),
    }
    const passwords = { hash: vi.fn(), verify: vi.fn().mockResolvedValue(true) }
    const sessions = {
      issue: vi.fn().mockResolvedValue({ token: 'token', maxAge: 100, purpose: 'full' }),
      inspect: vi.fn(),
      resolve: vi.fn(),
      revoke: vi.fn(),
    }
    const service = createAuthService(repository, passwords, sessions)
    expect(await service.login('STAFF@example.test', 'password')).toMatchObject({
      user,
      token: 'token',
      purpose: 'full',
    })
    expect(repository.findByEmail).toHaveBeenCalledWith('staff@example.test')
    sessions.issue.mockClear()
    passwords.verify.mockResolvedValue(false)
    await expect(service.login(user.email, 'wrong')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    repository.findByEmail.mockResolvedValue({ ...user, disabledAt: new Date() })
    await expect(service.login(user.email, 'password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    repository.findByEmail.mockResolvedValue(undefined)
    await expect(service.login(user.email, 'password')).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    })
    expect(sessions.issue).not.toHaveBeenCalled()
  })
  it('hashes session tokens and rejects missing sessions or disabled users', async () => {
    const repository = {
      create: vi.fn(),
      findActive: vi.fn().mockResolvedValue({ userId: user.id, purpose: 'full' }),
      revoke: vi.fn(),
    }
    const users = { findByEmail: vi.fn(), findById: vi.fn().mockResolvedValue(user) }
    const service = createSessionService(repository, users, 30)
    const { token } = await service.issue(user.id)
    const stored = repository.create.mock.calls[0]!
    expect(stored[1]).toMatch(/^[a-f0-9]{64}$/)
    expect(stored[1]).not.toBe(token)
    expect(await service.resolve()).toBeNull()
    expect(repository.findActive).not.toHaveBeenCalled()
    expect(await service.resolve(token)).toEqual(user)
    users.findById.mockResolvedValue({ ...user, disabledAt: new Date() })
    expect(await service.resolve(token)).toBeNull()
    repository.findActive.mockResolvedValue(undefined)
    expect(await service.resolve(token)).toBeNull()
    await service.revoke(token)
    expect(repository.revoke).toHaveBeenCalledWith(stored[1])
  })
  it('maps only public identity fields', () => {
    expect(toSession(user)).toEqual({
      permissionKeys: [],
      purpose: 'full',
      user: {
        id: user.id,
        email: user.email,
        firstName: 'Sara',
        lastName: 'Amrani',
        avatarUrl: null,
      },
    })
  })
})
