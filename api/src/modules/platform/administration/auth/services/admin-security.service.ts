import type {
  AdminPasskey,
  AdminReauthentication,
  AdminSecurity,
} from '../../../../../contracts/generated/administration/administration.schemas.js'
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
import type { createAdminAccountRepository } from '../repositories/admin-account.repository.js'
import type {
  createAdminCredentialRepository,
  PasskeyRow,
} from '../repositories/admin-credential.repository.js'
import {
  type AdminWebAuthn,
  assertionClaims,
  CHALLENGE_MINUTES,
  createRecoveryCodes,
} from './admin-webauthn.service.js'

export const REAUTH_MINUTES = 5
const MAX_REAUTH_FAILURES = 5
const MAX_PASSKEYS = 10

const reauthRequired = () =>
  new AppError(
    403,
    'REAUTHENTICATION_REQUIRED',
    'Confirm your identity to change security settings.',
  )
const reauthFailed = () =>
  new AppError(401, 'REAUTHENTICATION_FAILED', 'The identity confirmation failed.')
const passkeyView = (p: PasskeyRow): AdminPasskey => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt.toISOString(),
  lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
  backedUp: p.backedUp,
})

/**
 * Security settings of the signed-in administrator. Credential changes require a reauthentication
 * of the current full session within the last five minutes, are audited, and sign out the
 * administrator's other sessions. Failed proofs are bounded per session.
 */
export function createAdminSecurityService(options: {
  repo: ReturnType<typeof createAdminAccountRepository>
  credentials: ReturnType<typeof createAdminCredentialRepository>
  audit: AdminAuditService
  withAdmin: AdminTransaction
  passwords: ReturnType<typeof createPasswordService>
  webauthn: AdminWebAuthn
  totpKey?: Buffer
  clock?: () => Date
}) {
  const { repo, credentials, audit, withAdmin, passwords, webauthn } = options
  const clock = options.clock ?? (() => new Date())
  function key() {
    if (!options.totpKey)
      throw new AppError(
        503,
        'ADMIN_UNAVAILABLE',
        'Administrator sign-in is not configured on this server.',
      )
    return options.totpKey
  }
  const record = (
    admin: AuthenticatedAdmin,
    action: string,
    after: Record<string, unknown>,
    tx: Transaction,
  ) =>
    audit.record(
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
  const until = (at: Date, expiresAt: Date) =>
    new Date(Math.min(at.getTime() + REAUTH_MINUTES * 60_000, expiresAt.getTime()))

  /** Locks the current session and the admin row; throws unless recently reauthenticated. */
  async function fresh(admin: AuthenticatedAdmin, tx: Transaction) {
    const now = clock()
    const row = await repo.byId(admin.id, tx)
    const session = await repo.sessionById(admin.sessionId, tx)
    if (
      !session ||
      !session.verifiedAt ||
      session.adminId !== admin.id ||
      session.expiresAt <= now ||
      !row ||
      row.disabledAt ||
      !session.reauthenticatedAt ||
      now.getTime() - session.reauthenticatedAt.getTime() >= REAUTH_MINUTES * 60_000
    )
      throw reauthRequired()
    return { now, session, row }
  }
  /** Counts a failed proof on the session; the fifth revokes it. Commits even though the call fails. */
  async function failure(admin: AuthenticatedAdmin, stage: string, tx: Transaction) {
    const session = await repo.sessionById(admin.sessionId, tx)
    if (!session) return
    const failures = session.reauthFailures + 1
    await repo.updateSession(
      session.id,
      {
        reauthFailures: failures,
        ...(failures >= MAX_REAUTH_FAILURES ? { revokedAt: clock() } : {}),
      },
      tx,
    )
    await record(admin, 'auth.reauthenticate_failed', { stage, failures }, tx)
  }
  async function challenge(
    admin: AuthenticatedAdmin,
    purpose: 'reauth' | 'register',
    value: string,
    tx: Transaction,
  ) {
    return credentials.insertChallenge(
      {
        purpose,
        adminId: admin.id,
        sessionId: admin.sessionId,
        challenge: value,
        expiresAt: new Date(clock().getTime() + CHALLENGE_MINUTES * 60_000),
      },
      tx,
    )
  }
  /** Consumed in its own transaction so a failing verification still spends the challenge. */
  const consume = (admin: AuthenticatedAdmin, id: string, purpose: 'reauth' | 'register') =>
    withAdmin(async (tx) => {
      const row = await credentials.consumeChallenge(id, purpose, admin.sessionId, clock(), tx)
      return row && row.adminId === admin.id ? row.challenge : null
    })

  async function proof(admin: AuthenticatedAdmin, input: AdminReauthentication) {
    if (input.method === 'passkey') {
      if (!input.challengeId || !input.credential) return null
      const expected = await consume(admin, input.challengeId, 'reauth')
      const claimed = assertionClaims(input.credential).credentialId
      if (!expected || !claimed) return null
      return async (tx: Transaction, now: Date) => {
        const passkey = await credentials.passkeyByCredential(claimed, tx)
        if (!passkey || passkey.adminId !== admin.id) return false
        const verified = await webauthn.verifyAssertion(input.credential!, expected, passkey)
        return Boolean(
          verified && (await credentials.usePasskey(passkey, { ...verified, now }, tx)),
        )
      }
    }
    if (!input.password || !input.code) return null
    const box = createSecretBox(key())
    const stored = await withAdmin((tx) => repo.byId(admin.id, tx))
    if (!stored || !(await passwords.verify(input.password, stored.passwordHash))) return null
    return async (tx: Transaction, now: Date) => {
      const row = await repo.byId(admin.id, tx)
      if (!row?.totpSecret || row.passwordHash !== stored.passwordHash) return false
      let step: number | null = null
      try {
        step = verifyTotp(base32Decode(box.open(row.totpSecret)), input.code!, now)
      } catch {
        step = null
      }
      return step !== null && Boolean(await repo.acceptStep(admin.id, step, now, tx))
    }
  }

  return {
    async overview(admin: AuthenticatedAdmin): Promise<AdminSecurity> {
      return withAdmin(async (tx) => {
        const now = clock()
        const [row, session, passkeys, remaining] = await Promise.all([
          repo.byId(admin.id, tx),
          repo.sessionById(admin.sessionId, tx),
          credentials.passkeys(admin.id, tx),
          credentials.remainingRecoveryCodes(admin.id, tx),
        ])
        const at = session?.reauthenticatedAt
        const end = at && session ? until(at, session.expiresAt) : null
        return {
          totpEnrolled: Boolean(row?.totpEnrolledAt),
          passkeys: passkeys.map(passkeyView),
          recoveryCodesRemaining: remaining,
          reauthenticatedUntil: end && end > now ? end.toISOString() : null,
        }
      })
    },

    async reauthOptions(admin: AuthenticatedAdmin) {
      return withAdmin(async (tx) => {
        const optionsJSON = await webauthn.reauthOptions(await credentials.passkeys(admin.id, tx))
        return {
          challengeId: await challenge(admin, 'reauth', optionsJSON.challenge, tx),
          optionsJSON,
        }
      })
    },

    /** Passkey with user verification, or password plus a fresh TOTP code. */
    async reauthenticate(admin: AuthenticatedAdmin, input: AdminReauthentication) {
      const check = await proof(admin, input)
      const outcome = await withAdmin(async (tx) => {
        const now = clock()
        await repo.byId(admin.id, tx)
        const session = await repo.sessionById(admin.sessionId, tx)
        if (!session || session.expiresAt <= now) return null
        if (!check || !(await check(tx, now))) {
          await failure(admin, input.method, tx)
          return null
        }
        await repo.updateSession(session.id, { reauthenticatedAt: now, reauthFailures: 0 }, tx)
        await record(admin, 'auth.reauthenticate', { method: input.method }, tx)
        return until(now, session.expiresAt)
      })
      if (!outcome) throw reauthFailed()
      return { reauthenticatedUntil: outcome.toISOString() }
    },

    async registrationOptions(admin: AuthenticatedAdmin) {
      return withAdmin(async (tx) => {
        const { row } = await fresh(admin, tx)
        const optionsJSON = await webauthn.registrationOptions(
          row,
          await credentials.passkeys(admin.id, tx),
        )
        return {
          challengeId: await challenge(admin, 'register', optionsJSON.challenge, tx),
          optionsJSON,
        }
      })
    },

    async registerPasskey(
      admin: AuthenticatedAdmin,
      input: { challengeId: string; name: string; credential: Record<string, unknown> },
    ) {
      await withAdmin((tx) => fresh(admin, tx))
      const expected = await consume(admin, input.challengeId, 'register')
      const info = expected && (await webauthn.verifyRegistration(input.credential, expected))
      if (!info) throw new AppError(400, 'PASSKEY_INVALID', 'The passkey could not be verified.')
      return withAdmin(async (tx) => {
        const { now } = await fresh(admin, tx)
        if ((await credentials.passkeys(admin.id, tx)).length >= MAX_PASSKEYS)
          throw new AppError(409, 'PASSKEY_LIMIT', 'Remove a passkey before adding another.')
        const created = await credentials.insertPasskey(
          {
            adminId: admin.id,
            credentialId: info.credential.id,
            publicKey: new Uint8Array(info.credential.publicKey),
            counter: info.credential.counter,
            transports: info.credential.transports ?? [],
            deviceType: info.credentialDeviceType,
            backedUp: info.credentialBackedUp,
            name: input.name.trim(),
            createdAt: now,
          },
          tx,
        )
        if (!created)
          throw new AppError(409, 'PASSKEY_EXISTS', 'This passkey is already registered.')
        await record(admin, 'admin.passkey_add', { passkeyId: created.id, name: created.name }, tx)
        return passkeyView(created)
      })
    },

    removePasskey: (admin: AuthenticatedAdmin, id: string) =>
      withAdmin(async (tx) => {
        const { now } = await fresh(admin, tx)
        const removed = await credentials.deletePasskey(admin.id, id, tx)
        if (!removed) throw new AppError(404, 'NOT_FOUND', 'Passkey not found.')
        await repo.revokeOthers(admin.id, admin.sessionId, now, tx)
        await record(admin, 'admin.passkey_remove', { passkeyId: id, name: removed.name }, tx)
      }),

    /** Replaces every earlier code under the admin row lock; the new codes are returned once. */
    async regenerateRecoveryCodes(admin: AuthenticatedAdmin) {
      const recovery = createRecoveryCodes(key())
      const codes = recovery.generate()
      await withAdmin(async (tx) => {
        const { now } = await fresh(admin, tx)
        await credentials.replaceRecoveryCodes(admin.id, codes.map(recovery.hash), now, tx)
        await repo.revokeOthers(admin.id, admin.sessionId, now, tx)
        await record(admin, 'admin.recovery_codes_regenerate', { count: codes.length }, tx)
      })
      return { codes }
    },

    /** New secret kept pending; the current one keeps working until confirmation. */
    async resetTotp(admin: AuthenticatedAdmin) {
      const box = createSecretBox(key())
      const secret = generateTotpSecret()
      await withAdmin(async (tx) => {
        await fresh(admin, tx)
        await repo.updateAdmin(admin.id, { pendingTotpSecret: box.seal(secret) }, tx)
      })
      return { otpauthUri: otpauthUri(secret, admin.email), secret }
    },

    async confirmTotp(admin: AuthenticatedAdmin, code: string) {
      const box = createSecretBox(key())
      const accepted = await withAdmin(async (tx) => {
        const { now, row } = await fresh(admin, tx)
        if (!row.pendingTotpSecret)
          throw new AppError(409, 'TOTP_NOT_PENDING', 'Start the authenticator change first.')
        let step: number | null = null
        try {
          step = verifyTotp(base32Decode(box.open(row.pendingTotpSecret)), code, now)
        } catch {
          step = null
        }
        if (step === null) {
          await failure(admin, 'totp_confirm', tx)
          return false
        }
        await repo.updateAdmin(
          admin.id,
          {
            totpSecret: row.pendingTotpSecret,
            pendingTotpSecret: null,
            totpLastStep: step,
            totpEnrolledAt: now,
          },
          tx,
        )
        await repo.revokeOthers(admin.id, admin.sessionId, now, tx)
        await record(admin, 'admin.totp_reset', {}, tx)
        return true
      })
      if (!accepted)
        throw new AppError(401, 'INVALID_CODE', 'The verification code is invalid or has expired.')
    },
  }
}
