import { describe, expect, it, vi } from 'vitest'

import type { Database } from '../src/lib/db.js'
import { withOrganizationTransaction } from '../src/lib/organization-context.js'

const context = {
  organizationId: '33333333-3333-4333-8333-333333333333',
  actor: { type: 'owner' as const, id: '22222222-2222-4222-8222-222222222222' },
}

describe('Organization transaction boundary', () => {
  it('rejects missing or malformed scope before opening a database transaction', () => {
    const transaction = vi.fn()
    const db = { transaction } as unknown as Database
    const work = vi.fn()
    expect(() => withOrganizationTransaction(db, { ...context, organizationId: '' }, work)).toThrow(
      'Invalid authorized organization context',
    )
    expect(() =>
      withOrganizationTransaction(
        db,
        { ...context, actor: { type: 'owner', id: 'not-an-id' } },
        work,
      ),
    ).toThrow('Invalid authorized organization context')
    expect(transaction).not.toHaveBeenCalled()
    expect(work).not.toHaveBeenCalled()
  })

  it('does not execute tenant work when establishing context fails', async () => {
    const tx = { execute: vi.fn().mockRejectedValue(new Error('connection lost')) }
    const db = {
      transaction: async (callback: (value: unknown) => Promise<unknown>) => callback(tx),
    } as unknown as Database
    const work = vi.fn()
    await expect(withOrganizationTransaction(db, context, work)).rejects.toThrow('connection lost')
    expect(work).not.toHaveBeenCalled()
  })
})
