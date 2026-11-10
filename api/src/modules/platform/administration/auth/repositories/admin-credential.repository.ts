import { and, asc, count, eq, gt, isNull, sql } from 'drizzle-orm'

import {
  platformAdminPasskeys,
  platformAdminRecoveryCodes,
  platformAdminWebauthnChallenges,
} from '../../../../../../db/schema/administration.js'
import type { Transaction } from '../../../../../lib/db.js'

export type PasskeyRow = typeof platformAdminPasskeys.$inferSelect
export type ChallengePurpose = 'login' | 'reauth' | 'register'

/** Administrator passkeys, single-use WebAuthn challenges and hashed recovery codes. */
export function createAdminCredentialRepository() {
  return {
    passkeys: (adminId: string, tx: Transaction) =>
      tx
        .select()
        .from(platformAdminPasskeys)
        .where(eq(platformAdminPasskeys.adminId, adminId))
        .orderBy(asc(platformAdminPasskeys.createdAt)),
    /** Lock only after the owning admin row (lock order: admin, sessions, passkeys). */
    async passkeyByCredential(credentialId: string, tx: Transaction, lock = true) {
      const query = tx
        .select()
        .from(platformAdminPasskeys)
        .where(eq(platformAdminPasskeys.credentialId, credentialId))
      const [row] = lock ? await query.for('update') : await query
      return row
    },
    async insertPasskey(values: typeof platformAdminPasskeys.$inferInsert, tx: Transaction) {
      const [row] = await tx
        .insert(platformAdminPasskeys)
        .values(values)
        .onConflictDoNothing({ target: platformAdminPasskeys.credentialId })
        .returning()
      return row
    },
    async deletePasskey(adminId: string, id: string, tx: Transaction) {
      const [row] = await tx
        .delete(platformAdminPasskeys)
        .where(and(eq(platformAdminPasskeys.id, id), eq(platformAdminPasskeys.adminId, adminId)))
        .returning()
      return row
    },
    /** Records a verified assertion only if no concurrent use already advanced the counter. */
    async usePasskey(
      passkey: PasskeyRow,
      values: { counter: number; backedUp: boolean; now: Date },
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(platformAdminPasskeys)
        .set({ counter: values.counter, backedUp: values.backedUp, lastUsedAt: values.now })
        .where(
          and(
            eq(platformAdminPasskeys.id, passkey.id),
            eq(platformAdminPasskeys.counter, passkey.counter),
          ),
        )
        .returning({ id: platformAdminPasskeys.id })
      return Boolean(row)
    },
    async insertChallenge(
      values: {
        purpose: ChallengePurpose
        adminId: string | null
        sessionId: string | null
        challenge: string
        expiresAt: Date
      },
      tx: Transaction,
    ) {
      const [row] = await tx
        .insert(platformAdminWebauthnChallenges)
        .values(values)
        .returning({ id: platformAdminWebauthnChallenges.id })
      return row!.id
    },
    /**
     * Deletes at most `limit` challenges that expired before `before` (oldest first, via the expiry
     * index). Rows locked by a concurrent prune are skipped, so callers never wait on each other.
     */
    async pruneChallenges(before: Date, limit: number, tx: Transaction) {
      const rows = await tx.execute(sql`
        delete from platform_admin_webauthn_challenges
        where id in (select id from platform_admin_webauthn_challenges
                     where expires_at < ${before.toISOString()}::timestamptz
                     order by expires_at limit ${limit}
                     for update skip locked)
        returning id`)
      return rows.length
    },
    /**
     * Atomically consumes an unexpired challenge of this purpose and binding. A challenge is
     * returned at most once, whatever the outcome of the verification that follows.
     */
    async consumeChallenge(
      id: string,
      purpose: ChallengePurpose,
      sessionId: string | null,
      now: Date,
      tx: Transaction,
    ) {
      const [row] = await tx
        .update(platformAdminWebauthnChallenges)
        .set({ consumedAt: now })
        .where(
          and(
            eq(platformAdminWebauthnChallenges.id, id),
            eq(platformAdminWebauthnChallenges.purpose, purpose),
            isNull(platformAdminWebauthnChallenges.consumedAt),
            gt(platformAdminWebauthnChallenges.expiresAt, now),
            sessionId === null
              ? isNull(platformAdminWebauthnChallenges.sessionId)
              : eq(platformAdminWebauthnChallenges.sessionId, sessionId),
          ),
        )
        .returning({
          challenge: platformAdminWebauthnChallenges.challenge,
          adminId: platformAdminWebauthnChallenges.adminId,
        })
      return row
    },
    async consumeRecoveryCode(adminId: string, codeHash: string, now: Date, tx: Transaction) {
      const [row] = await tx
        .update(platformAdminRecoveryCodes)
        .set({ usedAt: now })
        .where(
          and(
            eq(platformAdminRecoveryCodes.adminId, adminId),
            eq(platformAdminRecoveryCodes.codeHash, codeHash),
            isNull(platformAdminRecoveryCodes.usedAt),
          ),
        )
        .returning({ id: platformAdminRecoveryCodes.id })
      return Boolean(row)
    },
    async replaceRecoveryCodes(adminId: string, hashes: string[], now: Date, tx: Transaction) {
      await tx
        .delete(platformAdminRecoveryCodes)
        .where(eq(platformAdminRecoveryCodes.adminId, adminId))
      await tx
        .insert(platformAdminRecoveryCodes)
        .values(hashes.map((codeHash) => ({ adminId, codeHash, createdAt: now })))
    },
    async remainingRecoveryCodes(adminId: string, tx: Transaction) {
      const [row] = await tx
        .select({ n: count() })
        .from(platformAdminRecoveryCodes)
        .where(
          and(
            eq(platformAdminRecoveryCodes.adminId, adminId),
            isNull(platformAdminRecoveryCodes.usedAt),
          ),
        )
      return Number(row?.n ?? 0)
    },
  }
}
