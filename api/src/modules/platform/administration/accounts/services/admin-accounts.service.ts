import { AppError } from '../../../../../lib/errors.js'
import type { createPasswordService } from '../../../../../lib/password.js'
import type { AdminAuditService } from '../../audit/services/admin-audit.service.js'
import type {
  AdminRow,
  createAdminAccountRepository,
} from '../../auth/repositories/admin-account.repository.js'
import { normalizeEmail } from '../../auth/services/admin-auth.service.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'

const CLI = 'cli'
const BOOTSTRAP = 'deployment'
const MIN_PASSWORD = 12
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export type AdminBootstrapInput = { email: string; name: string; password: string }

/**
 * Deployment bootstrap configuration from ADMIN_EMAIL / ADMIN_PASSWORD (optional ADMIN_NAME).
 * Neither set: null (nothing to provision). One without the other or invalid values: throws.
 * Messages never include the configured values.
 */
export function adminBootstrapConfig(env: Record<string, string | undefined>) {
  const email = env.ADMIN_EMAIL?.trim() ?? ''
  const password = env.ADMIN_PASSWORD ?? ''
  if (!email && !password) return null
  if (!email || !password)
    throw new AppError(
      400,
      'ADMIN_BOOTSTRAP_INCOMPLETE',
      'Set both ADMIN_EMAIL and ADMIN_PASSWORD, or neither.',
    )
  const normalized = normalizeEmail(email)
  if (normalized.length > 254 || !EMAIL.test(normalized))
    throw new AppError(400, 'ADMIN_BOOTSTRAP_INVALID_EMAIL', 'ADMIN_EMAIL is not a valid email.')
  if (password.length < MIN_PASSWORD)
    throw new AppError(400, 'WEAK_PASSWORD', 'ADMIN_PASSWORD needs at least 12 characters.')
  const name = env.ADMIN_NAME?.trim() || 'Administrator'
  return { email: normalized, name, password } satisfies AdminBootstrapInput
}
const snapshot = (a: AdminRow) => ({
  email: a.email,
  name: a.name,
  disabled: Boolean(a.disabledAt),
  totpEnrolled: Boolean(a.totpEnrolledAt),
})

/** Operator bootstrap tooling only (no HTTP surface in v1). Every change is audited. */
export function createAdminAccountsService(
  repo: ReturnType<typeof createAdminAccountRepository>,
  audit: AdminAuditService,
  withAdmin: AdminTransaction,
  passwords: ReturnType<typeof createPasswordService>,
) {
  async function find(
    email: string,
    work: (
      admin: AdminRow,
      tx: Parameters<Parameters<AdminTransaction>[0]>[0],
    ) => Promise<AdminRow>,
  ) {
    return withAdmin(async (tx) => {
      const admin = await repo.byEmail(normalizeEmail(email), tx)
      if (!admin) throw new AppError(404, 'NOT_FOUND', 'Administrator not found.')
      return snapshot(await work(admin, tx))
    })
  }
  async function insert(input: AdminBootstrapInput, actor: string) {
    if (input.password.length < MIN_PASSWORD)
      throw new AppError(400, 'WEAK_PASSWORD', 'Use at least 12 characters.')
    const passwordHash = await passwords.hash(input.password)
    return withAdmin(async (tx) => {
      const admin = await repo.create(
        { email: normalizeEmail(input.email), name: input.name.trim(), passwordHash },
        tx,
      )
      if (admin)
        await audit.record(
          {
            adminId: admin.id,
            actor,
            action: 'admin.create',
            targetType: 'platform_admin',
            targetId: admin.id,
            before: null,
            after: snapshot(admin),
          },
          tx,
        )
      return admin
    })
  }
  return {
    async create(input: AdminBootstrapInput) {
      const admin = await insert(input, CLI)
      if (!admin) throw new AppError(409, 'ADMIN_EXISTS', 'This administrator already exists.')
      return snapshot(admin)
    },
    /**
     * Deployment bootstrap: creates the configured administrator once. An existing account (any
     * state, including disabled) is left untouched: no password, name, factor or session change.
     * The unique email insert serializes concurrent replicas, so creation is audited exactly once.
     */
    async ensure(input: AdminBootstrapInput) {
      const admin = await insert(input, BOOTSTRAP)
      return { created: Boolean(admin) }
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
        await audit.record(
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
          { totpSecret: null, pendingTotpSecret: null, totpEnrolledAt: null, totpLastStep: null },
          tx,
        ))!
        await repo.revokeAll(admin.id, now, tx)
        await audit.record(
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
