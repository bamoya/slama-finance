import { createHash, randomBytes } from 'node:crypto'

import type { PasswordResetDelivery } from '../../../../integrations/contracts.js'
import { AppError } from '../../../../lib/errors.js'
import { resolveLanguage } from '../../../../lib/language.js'
import type { createPasswordRecoveryRepository } from '../repositories/password-recovery.repository.js'
import type { createPasswordService } from './password.service.js'

const hash = (token: string) => createHash('sha256').update(token).digest('hex')
export function createPasswordRecoveryService(
  repository: ReturnType<typeof createPasswordRecoveryRepository>,
  passwords: ReturnType<typeof createPasswordService>,
  delivery?: { adapter: PasswordResetDelivery; resetUrl: string },
) {
  if (delivery) {
    const url = new URL(delivery.resetUrl)
    if (
      url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
      throw new Error('Password reset URL must use HTTPS (except localhost)')
  }
  return {
    async request(email: string) {
      if (!delivery)
        throw new AppError(503, 'EMAIL_UNAVAILABLE', 'Password recovery is not configured')
      const token = randomBytes(32).toString('base64url')
      const tokenHash = hash(token)
      const expiresAt = new Date(Date.now() + 15 * 60_000)
      const normalized = email.toLowerCase()
      if (!(await repository.issue(normalized, tokenHash, expiresAt))) return
      const url = new URL(delivery.resetUrl)
      // Fragment avoids placing the secret in server/proxy URL query logs.
      url.hash = new URLSearchParams({ token }).toString()
      try {
        await delivery.adapter.send({
          to: normalized,
          resetUrl: url.toString(),
          expiresAt,
          language: resolveLanguage(undefined, await repository.companyLocale()),
        })
      } catch {
        await repository.invalidate(tokenHash)
        // Same public response as unknown/disabled accounts; never expose a delivery error or token.
      }
    },
    async reset(token: string, password: string) {
      const passwordHash = await passwords.hash(password)
      if (!(await repository.consume(hash(token), passwordHash)))
        throw new AppError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired')
    },
  }
}
