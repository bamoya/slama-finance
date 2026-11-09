import { createHash } from 'node:crypto'

import { escapeHtml as escape } from '../../lib/html.js'
import type { EmailProvider, PasswordResetDelivery } from '../contracts.js'

/** Provider-neutral reset message; used with the local-only Mailpit provider during development. */
export function createProviderResetDelivery(
  provider: EmailProvider,
  from: string,
): PasswordResetDelivery {
  return {
    async send(input) {
      const fr = input.language !== 'en'
      const subject = fr ? 'Réinitialisez votre mot de passe' : 'Reset your password'
      const text = fr
        ? 'Choisissez un nouveau mot de passe pour votre compte. Ce lien expire dans 15 minutes.'
        : 'Choose a new password for your account. This link expires in 15 minutes.'
      await provider.send({
        idempotencyKey: `staff-reset-${createHash('sha256').update(input.resetUrl).digest('hex')}`,
        from: { email: from, name: 'B-Finance' },
        to: input.to,
        cc: [],
        subject,
        text: `${subject}\n\n${text}\n${input.resetUrl}`,
        html: `<!doctype html><html lang="${fr ? 'fr' : 'en'}"><body style="font-family:Arial,sans-serif;background:#f7f7f5;color:#222"><main style="max-width:520px;margin:32px auto;background:white;padding:32px;border-radius:16px"><p style="color:#ad7d1d;font-weight:bold">B-Finance</p><h1>${subject}</h1><p>${text}</p><p><a href="${escape(input.resetUrl)}" style="display:inline-block;padding:12px 20px;background:#ad7d1d;color:white;border-radius:8px">${subject}</a></p></main></body></html>`,
        attachments: [],
      })
    },
  }
}
