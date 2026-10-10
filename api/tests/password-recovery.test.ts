import { describe, expect, it, vi } from 'vitest'

import { createPasswordRecoveryService } from '../src/modules/identity/auth/services/password-recovery.service.js'

describe('password recovery delivery boundary', () => {
  function fixture() {
    const repository = {
      companyLocale: vi.fn().mockResolvedValue('fr-MA'),
      issue: vi.fn().mockResolvedValue(true),
      invalidate: vi.fn(),
      consume: vi.fn().mockResolvedValue(true),
    }
    const passwords = { hash: vi.fn().mockResolvedValue('hashed-password'), verify: vi.fn() }
    const adapter = { send: vi.fn() }
    return { repository, passwords, adapter }
  }
  it('fails uniformly before account lookup if email delivery is not configured', async () => {
    const { repository, passwords } = fixture()
    const service = createPasswordRecoveryService(repository, passwords)
    await expect(service.request('staff@example.test')).rejects.toMatchObject({
      statusCode: 503,
      code: 'EMAIL_UNAVAILABLE',
    })
    expect(repository.issue).not.toHaveBeenCalled()
  })
  it('invalidates undelivered tokens without exposing delivery errors', async () => {
    const { repository, passwords, adapter } = fixture()
    adapter.send.mockRejectedValue(new Error('private provider error'))
    const service = createPasswordRecoveryService(repository, passwords, {
      adapter,
      resetUrl: 'https://finance.example/reset-password',
    })
    await expect(service.request('STAFF@example.test')).resolves.toBeUndefined()
    expect(repository.invalidate).toHaveBeenCalledWith(repository.issue.mock.calls[0]![1])
    expect(adapter.send.mock.calls[0]![0].to).toBe('staff@example.test')
    expect(new URL(adapter.send.mock.calls[0]![0].resetUrl).search).toBe('')
  })
  it('does not send for ineligible or cooled-down accounts', async () => {
    const { repository, passwords, adapter } = fixture()
    repository.issue.mockResolvedValue(false)
    const service = createPasswordRecoveryService(repository, passwords, {
      adapter,
      resetUrl: 'https://finance.example/reset-password',
    })
    await service.request('nobody@example.test')
    expect(adapter.send).not.toHaveBeenCalled()
  })
  it('rejects non-HTTPS remote recovery URLs', () => {
    const { repository, passwords, adapter } = fixture()
    expect(() =>
      createPasswordRecoveryService(repository, passwords, {
        adapter,
        resetUrl: 'http://finance.example/reset-password',
      }),
    ).toThrow('HTTPS')
  })
})
