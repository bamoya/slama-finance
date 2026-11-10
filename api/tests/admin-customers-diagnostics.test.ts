import { describe, expect, it } from 'vitest'

import { AppError } from '../src/lib/errors.js'
import { createAdminCustomersService } from '../src/modules/platform/administration/customers/services/admin-customers.service.js'

const owner = (id: string) => ({
  id,
  email: `${id}@example.test`,
  firstName: null,
  lastName: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  disabledAt: null,
  blockedAt: null,
  deletionDueAt: null,
  invitedAt: null,
  emailVerifiedAt: null,
})
const service = (summary: (id: string) => Promise<unknown>) =>
  createAdminCustomersService(
    {
      owners: async () => ({
        rows: [
          { owner: owner('bad'), organizationCount: 1 },
          { owner: owner('ok'), organizationCount: 0 },
        ],
        total: 2,
      }),
    } as never,
    {} as never,
    {} as never,
    ((work: (tx: unknown) => unknown) => work({})) as never,
    { summary } as never,
  )

describe('admin owner list diagnostics', () => {
  it.each(['SUBSCRIPTION_CATALOG_UNAVAILABLE', 'SUBSCRIPTION_PERIODS_INCONSISTENT'])(
    'reports %s on its row only',
    async (code) => {
      const page = await service(async (id) => {
        if (id === 'bad') throw new AppError(503, code, 'unavailable')
        return { status: 'trial', planCode: 'trial', paidThroughAt: null }
      }).list({ page: 1 } as never)
      expect(
        page.items.map((i) => [i.id, i.subscriptionStatus, i.planCode, i.subscriptionError]),
      ).toEqual([
        ['bad', null, null, code],
        ['ok', 'trial', 'trial', null],
      ])
    },
  )
  it('propagates any other error instead of hiding it', async () => {
    const list = (error: Error) =>
      service(async () => {
        throw error
      }).list({ page: 1 } as never)
    await expect(list(new AppError(503, 'TIMEZONE_DATA_MISMATCH', 'x'))).rejects.toMatchObject({
      code: 'TIMEZONE_DATA_MISMATCH',
    })
    await expect(list(new Error('boom'))).rejects.toThrow('boom')
  })
})
