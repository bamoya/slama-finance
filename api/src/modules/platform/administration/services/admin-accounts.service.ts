import { AppError } from '../../../../lib/errors.js'
import type { createPasswordService } from '../../../../lib/password.js'
import type { AdminRow, createAdminRepository } from '../repositories/admin.repository.js'
import { normalizeEmail } from './admin-auth.service.js'

const CLI = 'cli'
const snapshot = (a: AdminRow) => ({
  email: a.email,
  name: a.name,
  disabled: Boolean(a.disabledAt),
  totpEnrolled: Boolean(a.totpEnrolledAt),
})

/** Operator bootstrap tooling only (no HTTP surface in v1). Every change is audited. */
export function createAdminAccountsService(
  repo: ReturnType<typeof createAdminRepository>,
  passwords: ReturnType<typeof createPasswordService>,
) {
  async function find(
    email: string,
    work: (
      admin: AdminRow,
      tx: Parameters<Parameters<typeof repo.admin>[0]>[0],
    ) => Promise<AdminRow>,
  ) {
    return repo.admin(async (tx) => {
      const admin = await repo.byEmail(normalizeEmail(email), tx)
      if (!admin) throw new AppError(404, 'NOT_FOUND', 'Administrator not found.')
      return snapshot(await work(admin, tx))
    })
  }
  return {
    async create(input: { email: string; name: string; password: string }) {
      if (input.password.length < 12)
        throw new AppError(400, 'WEAK_PASSWORD', 'Use at least 12 characters.')
      const passwordHash = await passwords.hash(input.password)
      return repo.admin(async (tx) => {
        const admin = await repo.create(
          { email: normalizeEmail(input.email), name: input.name.trim(), passwordHash },
          tx,
        )
        if (!admin) throw new AppError(409, 'ADMIN_EXISTS', 'This administrator already exists.')
        await repo.audit(
          {
            adminId: admin.id,
            actor: CLI,
            action: 'admin.create',
            targetType: 'platform_admin',
            targetId: admin.id,
            before: null,
            after: snapshot(admin),
          },
          tx,
        )
        return snapshot(admin)
      })
    },
    disable: (email: string) =>
      find(email, async (admin, tx) => {
        const now = new Date()
        const after = (await repo.updateAdmin(
          admin.id,
          { disabledAt: admin.disabledAt ?? now },
          tx,
        ))!
        await repo.revokeAll(admin.id, now, tx)
        await repo.audit(
          {
            adminId: admin.id,
            actor: CLI,
            action: 'admin.disable',
            targetType: 'platform_admin',
            targetId: admin.id,
            before: snapshot(admin),
            after: snapshot(after),
          },
          tx,
        )
        return after
      }),
    /** Forces re-enrollment at next sign-in and ends every session. */
    reset2fa: (email: string) =>
      find(email, async (admin, tx) => {
        const now = new Date()
        const after = (await repo.updateAdmin(
          admin.id,
          { totpSecret: null, totpEnrolledAt: null, totpLastStep: null },
          tx,
        ))!
        await repo.revokeAll(admin.id, now, tx)
        await repo.audit(
          {
            adminId: admin.id,
            actor: CLI,
            action: 'admin.reset_2fa',
            targetType: 'platform_admin',
            targetId: admin.id,
            before: snapshot(admin),
            after: snapshot(after),
          },
          tx,
        )
        return after
      }),
  }
}
