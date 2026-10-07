import { createHash, randomBytes } from 'node:crypto'

import type { Transaction } from '../../../../lib/db.js'
import type { createAuthRepository } from '../repositories/auth.repository.js'
import type { createSessionRepository } from '../repositories/session.repository.js'

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
export function createSessionService(
  repository: ReturnType<typeof createSessionRepository>,
  users: Pick<ReturnType<typeof createAuthRepository>, 'findById'>,
  ttlDays: number,
) {
  async function inspect(token?: string, tx?: Transaction) {
    if (!token) return null
    const session = await repository.findActive(hash(token), tx)
    if (!session) return null
    const user = await users.findById(session.userId, tx)
    if (!user || user.disabledAt || user.archivedAt) return null
    if (session.purpose === 'full' && user.mustChangePassword) return null
    if (
      session.purpose === 'password_change' &&
      (!user.mustChangePassword || !user.temporaryPasswordConsumedAt)
    )
      return null
    return { user, purpose: session.purpose }
  }
  return {
    async issue(userId: string, purpose: 'full' | 'password_change' = 'full', tx?: Transaction) {
      const token = randomBytes(32).toString('base64url')
      const maxAge = purpose === 'password_change' ? 15 * 60 : ttlDays * 86_400
      await repository.create(
        userId,
        hash(token),
        new Date(Date.now() + maxAge * 1000),
        purpose,
        tx,
      )
      return { token, maxAge, purpose }
    },
    inspect,
    async resolve(token?: string) {
      const result = await inspect(token)
      return result?.purpose === 'full' ? result.user : null
    },
    async revoke(token?: string) {
      if (token) await repository.revoke(hash(token))
    },
  }
}
