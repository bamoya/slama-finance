import { randomBytes } from 'node:crypto'

import type { Transaction } from '../../../../../lib/db.js'
import { AppError } from '../../../../../lib/errors.js'
import type { createPasswordService } from '../../../../../lib/password.js'
import { hashToken as hash } from '../../../../../lib/token-hash.js'
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
import type { createAdminCredentialRepository } from '../repositories/admin-credential.repository.js'
import {
  type AdminWebAuthn,
  assertionClaims,
  CHALLENGE_MINUTES,
  createRecoveryCodes,
  userHandleOf,
} from './admin-webauthn.service.js'

export const ADMIN_SESSION_HOURS = 8
export const ADMIN_IDLE_MINUTES = 30
const PENDING_MINUTES = 5
const MAX_CODE_ATTEMPTS = 5
// Expired challenges older than this margin are deleted, at most a batch per issued challenge.
const CHALLENGE_PRUNE_MARGIN_MS = 60_000
const CHALLENGE_PRUNE_BATCH = 50

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
  options: {
    totpKey?: Buffer
    clock?: () => Date
    credentials: ReturnType<typeof createAdminCredentialRepository>
    webauthn: AdminWebAuthn
  },
) {
  const { credentials, webauthn } = options
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
  const view = (admin: AdminRow, expiresAt: Date, sessionId: string): AuthenticatedAdmin => ({
    id: admin.id,
    email: admin.email,
    name: admin.name,
    expiresAt,
    sessionId,
  })
  const failed = (admin: AdminRow | undefined, actor: string, after: object, tx: Transaction) =>
    audit.record(
      {
        adminId: admin?.id ?? null,
        actor: admin?.email ?? actor,
        action: 'auth.login_failed',
        targetType: 'platform_admin',
        targetId: admin?.id ?? null,
        before: null,
        after: after as Record<string, unknown>,
      },
      tx,
    )
  /** Full 8-hour session; recovery sign-in also counts as a fresh reauthentication. */
  async function issue(
    admin: AdminRow,
    now: Date,
    action: string,
    after: Record<string, unknown>,
    tx: Transaction,
    reauthenticated = false,
  ) {
    const token = randomBytes(32).toString('base64url')
    const expiresAt = new Date(now.getTime() + ADMIN_SESSION_HOURS * 3_600_000)
    const session = await repo.insertSession(
      {
        adminId: admin.id,
        tokenHash: hash(token),
        verifiedAt: now,
        reauthenticatedAt: reauthenticated ? now : null,
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
        action,
        targetType: 'platform_admin',
        targetId: admin.id,
        before: null,
        after,
      },
      tx,
    )
    return {
      token,
      admin: view(admin, expiresAt, session.id),
      maxAge: ADMIN_SESSION_HOURS * 3600,
    }
  }
  /**
   * Pending password session still allowed to try a second factor. The admin row is locked before
   * the session so concurrent sign-ins that revoke each other's sessions cannot deadlock.
   */
  async function pending(pendingToken: string, now: Date, tx: Transaction) {
    const adminId = await repo.sessionAdmin(hash(pendingToken), tx)
    const admin = adminId && (await repo.byId(adminId, tx))
    if (!admin || admin.disabledAt) return null
    const found = await repo.session(hash(pendingToken), tx)
    if (!found || found.session.verifiedAt || found.session.expiresAt <= now) return null
    return { session: found.session, admin }
  }
  async function pendingFailure(
    found: NonNullable<Awaited<ReturnType<typeof pending>>>,
    stage: string,
    now: Date,
    tx: Transaction,
  ) {
    const attempts = found.session.failedAttempts + 1
    await repo.updateSession(
      found.session.id,
      { failedAttempts: attempts, ...(attempts >= MAX_CODE_ATTEMPTS ? { revokedAt: now } : {}) },
      tx,
    )
    await failed(found.admin, found.admin.email, { stage, attempts }, tx)
  }

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
          await failed(admin, normalized.slice(0, 254), { stage: 'password' }, tx)
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
        const found = await pending(pendingToken, now, tx)
        if (!found || !found.admin.totpSecret) return null
        const { admin } = found
        let step: number | null = null
        try {
          step = verifyTotp(base32Decode(secrets.open(admin.totpSecret!)), code, now)
        } catch {
          step = null
        }
        const accepted = step !== null && (await repo.acceptStep(admin.id, step, now, tx))
        if (!accepted) {
          await pendingFailure(found, 'totp', now, tx)
          return null
        }
        await repo.updateSession(found.session.id, { revokedAt: now }, tx)
        return issue(admin, now, 'auth.login', { enrolled: !admin.totpEnrolledAt }, tx)
      })
      if (!outcome) throw invalidCode()
      return outcome
    },

    /**
     * Recovery: a pending password session plus one unused recovery code replaces the second
     * factor. The code is consumed under the admin row lock, every other session is revoked and
     * the new session is reauthenticated so the lost factor can be replaced.
     */
    async recover(pendingToken: string | undefined, recoveryCode: string) {
      box()
      const codes = createRecoveryCodes(options.totpKey!)
      if (!pendingToken) throw invalidCode()
      const outcome = await withAdmin(async (tx) => {
        const now = clock()
        const found = await pending(pendingToken, now, tx)
        if (!found || !found.admin.totpEnrolledAt) return null
        const used = await credentials.consumeRecoveryCode(
          found.admin.id,
          codes.hash(recoveryCode),
          now,
          tx,
        )
        if (!used) {
          await pendingFailure(found, 'recovery_code', now, tx)
          return null
        }
        await repo.revokeAll(found.admin.id, now, tx)
        const remaining = await credentials.remainingRecoveryCodes(found.admin.id, tx)
        return issue(found.admin, now, 'auth.recovery_login', { remaining }, tx, true)
      })
      if (!outcome) throw invalidCode()
      return outcome
    },

    /**
     * Discoverable-passkey sign-in options; the challenge is stored unbound and single-use. Each
     * call also prunes a bounded batch of long-expired challenges, so retention stays proportional
     * to the request rate instead of growing forever.
     */
    async passkeyOptions() {
      box()
      const optionsJSON = await webauthn.loginOptions()
      const challengeId = await withAdmin(async (tx) => {
        const now = clock()
        await credentials.pruneChallenges(
          new Date(now.getTime() - CHALLENGE_PRUNE_MARGIN_MS),
          CHALLENGE_PRUNE_BATCH,
          tx,
        )
        return credentials.insertChallenge(
          {
            purpose: 'login',
            adminId: null,
            sessionId: null,
            challenge: optionsJSON.challenge,
            expiresAt: new Date(now.getTime() + CHALLENGE_MINUTES * 60_000),
          },
          tx,
        )
      })
      return { challengeId, optionsJSON }
    },

    /**
     * Passkey sign-in without TOTP. The challenge is consumed in its own transaction first so a
     * failed or replayed assertion can never reuse it.
     */
    async passkeyLogin(challengeId: string, response: Record<string, unknown>) {
      box()
      const challenge = await withAdmin((tx) =>
        credentials.consumeChallenge(challengeId, 'login', null, clock(), tx),
      )
      const claims = assertionClaims(response)
      const outcome = await withAdmin(async (tx) => {
        const now = clock()
        const claimed =
          challenge && claims.credentialId
            ? await credentials.passkeyByCredential(claims.credentialId, tx, false)
            : undefined
        const admin = claimed && (await repo.byId(claimed.adminId, tx))
        const passkey = admin && (await credentials.passkeyByCredential(claimed.credentialId, tx))
        const verified =
          admin &&
          passkey?.adminId === admin.id &&
          !admin.disabledAt &&
          claims.userHandle === userHandleOf(admin.id)
            ? await webauthn.verifyAssertion(response, challenge!.challenge, passkey)
            : null
        if (!verified || !(await credentials.usePasskey(passkey!, { ...verified, now }, tx))) {
          await failed(admin, 'passkey', { stage: 'passkey' }, tx)
          return null
        }
        return issue(admin!, now, 'auth.passkey_login', { passkeyId: passkey!.id }, tx)
      })
      if (!outcome) throw invalidCredentials()
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
        return view(found.admin, found.session.expiresAt, found.session.id)
      })
      if (!admin) throw unauthenticated()
      return admin
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
