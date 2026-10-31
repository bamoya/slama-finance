import { createHash, randomBytes } from 'node:crypto'

import type { Transaction } from '../../../../../lib/db.js'
import { AppError } from '../../../../../lib/errors.js'
import type { createPasswordService } from '../../../../../lib/password.js'
import {
  base32Decode,
  createSecretBox,
  generateTotpSecret,
  otpauthUri,
  verifyTotp,
} from '../../../../../lib/totp.js'
import type { AdminAuditService } from '../../audit/services/admin-audit.service.js'
import type { AdminTransaction } from '../../shared/repositories/admin-transaction.repository.js'
import type { AuthenticatedAdmin } from '../../shared/types/authenticated-admin.js'
import type {
  AdminRow,
  createAdminAccountRepository,
} from '../repositories/admin-account.repository.js'

export const ADMIN_SESSION_HOURS = 8
export const ADMIN_IDLE_MINUTES = 30
const PENDING_MINUTES = 5
const MAX_CODE_ATTEMPTS = 5

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
// Valid scrypt shape so unknown-email verification costs the same as a real one.
const dummyHash = `${'0'.repeat(32)}:${'0'.repeat(128)}`
export const normalizeEmail = (email: string) => email.trim().toLowerCase()
const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.')
const invalidCode = () =>
  new AppError(401, 'INVALID_CODE', 'The verification code is invalid or has expired.')
const unauthenticated = () =>
  new AppError(401, 'UNAUTHENTICATED', 'Sign in to the administration portal.')

export type { AuthenticatedAdmin }

export function createAdminAuthService(
  repo: ReturnType<typeof createAdminAccountRepository>,
  audit: AdminAuditService,
  withAdmin: AdminTransaction,
  passwords: ReturnType<typeof createPasswordService>,
  options: { totpKey?: Buffer; clock?: () => Date },
) {
  const clock = options.clock ?? (() => new Date())
  function box() {
    if (!options.totpKey)
      throw new AppError(
        503,
        'ADMIN_UNAVAILABLE',
        'Administrator sign-in is not configured on this server.',
      )
    return createSecretBox(options.totpKey)
  }
  const view = (admin: AdminRow, expiresAt: Date) => ({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    expiresAt,
  })

  return {
    /** Password step. Always returns a pending session token; the second factor is mandatory. */
    async login(email: string, password: string) {
      const secrets = box()
      const normalized = normalizeEmail(email)
      const candidate = await withAdmin((tx) => repo.byEmail(normalized, tx))
      const valid = await passwords.verify(password, candidate?.passwordHash ?? dummyHash)
      const outcome = await withAdmin(async (tx) => {
        const now = clock()
        const admin = candidate && (await repo.byId(candidate.id, tx))
        if (!admin || !valid || admin.disabledAt || admin.passwordHash !== candidate.passwordHash) {
          await audit.record(
            {
              adminId: admin?.id ?? null,
              actor: normalized.slice(0, 254),
              action: 'auth.login_failed',
              targetType: 'platform_admin',
              targetId: admin?.id ?? null,
              before: null,
              after: { stage: 'password' },
            },
            tx,
          )
          return null
        }
        let enrollment: { otpauthUri: string; secret: string } | null = null
        if (!admin.totpEnrolledAt) {
          // A fresh secret each unenrolled sign-in: it is shown only once.
          const secret = generateTotpSecret()
          await repo.updateAdmin(
            admin.id,
            { totpSecret: secrets.seal(secret), totpLastStep: null },
            tx,
          )
          enrollment = { otpauthUri: otpauthUri(secret, admin.email), secret }
        }
        const token = randomBytes(32).toString('base64url')
        await repo.insertSession(
          {
            adminId: admin.id,
            tokenHash: hash(token),
            createdAt: now,
            lastSeenAt: now,
            expiresAt: new Date(now.getTime() + PENDING_MINUTES * 60_000),
          },
          tx,
        )
        return { token, enrollment, maxAge: PENDING_MINUTES * 60 }
      })
      if (!outcome) throw invalidCredentials()
      return {
        ...outcome,
        step: outcome.enrollment ? ('enroll' as const) : ('verify' as const),
      }
    },

    /** Second factor: completes enrollment or sign-in and rotates to a full session token. */
    async verify(pendingToken: string | undefined, code: string) {
      const secrets = box()
      if (!pendingToken) throw invalidCode()
      const outcome = await withAdmin(async (tx) => {
        const now = clock()
        const found = await repo.session(hash(pendingToken), tx)
        if (!found || found.session.verifiedAt || found.session.expiresAt <= now) return null
        const admin = await repo.byId(found.admin.id, tx)
        if (!admin || admin.disabledAt || !admin.totpSecret) return null
        let step: number | null = null
        try {
          step = verifyTotp(base32Decode(secrets.open(admin.totpSecret)), code, now)
        } catch {
          step = null
        }
        const accepted = step !== null && (await repo.acceptStep(admin.id, step, now, tx))
        if (!accepted) {
          const attempts = found.session.failedAttempts + 1
          await repo.updateSession(
            found.session.id,
            {
              failedAttempts: attempts,
              ...(attempts >= MAX_CODE_ATTEMPTS ? { revokedAt: now } : {}),
            },
            tx,
          )
          await audit.record(
            {
              adminId: admin.id,
              actor: admin.email,
              action: 'auth.login_failed',
              targetType: 'platform_admin',
              targetId: admin.id,
              before: null,
              after: { stage: 'totp', attempts },
            },
            tx,
          )
          return null
        }
        await repo.updateSession(found.session.id, { revokedAt: now }, tx)
        const token = randomBytes(32).toString('base64url')
        const expiresAt = new Date(now.getTime() + ADMIN_SESSION_HOURS * 3_600_000)
        await repo.insertSession(
          {
            adminId: admin.id,
            tokenHash: hash(token),
            verifiedAt: now,
            createdAt: now,
            lastSeenAt: now,
            expiresAt,
          },
          tx,
        )
        await audit.record(
          {
            adminId: admin.id,
            actor: admin.email,
            action: 'auth.login',
            targetType: 'platform_admin',
            targetId: admin.id,
            before: null,
            after: { enrolled: !admin.totpEnrolledAt },
          },
          tx,
        )
        return { token, admin: view(admin, expiresAt), maxAge: ADMIN_SESSION_HOURS * 3600 }
      })
      if (!outcome) throw invalidCode()
      return outcome
    },

    /** Verified, unexpired, recently active session of an enabled administrator. */
    async authenticate(token?: string): Promise<AuthenticatedAdmin> {
      if (!token) throw unauthenticated()
      const admin = await withAdmin(async (tx) => {
        const now = clock()
        const found = await repo.session(hash(token), tx)
        if (
          !found ||
          !found.session.verifiedAt ||
          found.admin.disabledAt ||
          found.session.expiresAt <= now ||
          now.getTime() - found.session.lastSeenAt.getTime() >= ADMIN_IDLE_MINUTES * 60_000
        )
          return null
        await repo.updateSession(found.session.id, { lastSeenAt: now }, tx)
        return view(found.admin, found.session.expiresAt)
      })
      if (!admin) throw unauthenticated()
      return admin
    },

    /**
     * Fresh second factor for sensitive actions, inside the action's transaction. Each code is
     * accepted once (shared replay guard with sign-in); a failed action rolls the step back.
     */
    async stepUp(admin: AuthenticatedAdmin, code: string, tx: Transaction) {
      const secrets = box()
      const now = clock()
      const row = await repo.byId(admin.id, tx)
      let step: number | null = null
      try {
        if (row?.totpSecret && !row.disabledAt)
          step = verifyTotp(base32Decode(secrets.open(row.totpSecret)), code, now)
      } catch {
        step = null
      }
      if (step === null || !(await repo.acceptStep(admin.id, step, now, tx)))
        throw new AppError(
          403,
          'TWO_FACTOR_INVALID',
          'Enter a new code from your authenticator app to confirm this action.',
        )
    },

    async logout(token?: string) {
      if (!token) return
      await withAdmin(async (tx) => {
        const found = await repo.session(hash(token), tx)
        if (found) await repo.updateSession(found.session.id, { revokedAt: clock() }, tx)
      })
    },
  }
}
