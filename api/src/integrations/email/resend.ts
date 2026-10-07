import { createHash } from 'node:crypto'

import type { PasswordResetDelivery } from '../contracts.js'

export function createResendResetDelivery(options: {
  apiKey: string
  from: string
  fetch?: typeof fetch
  onFailure?: () => void
}): PasswordResetDelivery {
  const send = options.fetch ?? globalThis.fetch
  return {
    async send(message) {
      const idempotencyKey = `password-reset/${createHash('sha256').update(message.resetUrl).digest('hex')}`
      // One bounded retry for network/5xx failures, with the same idempotency key.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await send('https://api.resend.com/emails', {
            method: 'POST',
            redirect: 'error',
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': idempotencyKey,
            },
            signal: AbortSignal.timeout(4000),
            body: JSON.stringify({
              from: options.from,
              to: [message.to],
              subject: 'Reset your Slama Finance password',
              text: `A password reset was requested for your Slama Finance account.\n\nOpen this link to choose a new password:\n${message.resetUrl}\n\nThis link expires at ${message.expiresAt.toISOString()} and can only be used once. If you did not request this, ignore this email.`,
            }),
          })
          if (response.ok) {
            const data: unknown = await response.json()
            if (data && typeof data === 'object' && 'id' in data && typeof data.id === 'string')
              return
          }
          await response.body?.cancel().catch(() => {})
          if (response.status < 500 || attempt === 1) break
        } catch {
          if (attempt === 1) break
        }
      }
      options.onFailure?.()
      throw new Error('Password reset email delivery failed')
    },
  }
}
