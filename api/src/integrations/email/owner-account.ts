import { createHash } from 'node:crypto'

import type { EmailProvider, OwnerAccountDelivery } from '../contracts.js'

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export function createOwnerAccountDelivery(
  provider: EmailProvider,
  from: string,
): OwnerAccountDelivery {
  return {
    async send(input) {
      const fr = input.language === 'fr'
      const text = {
        verify_email: {
          subject: fr ? 'Vérifiez votre adresse e-mail' : 'Verify your email address',
          detail: fr
            ? 'Confirmez votre adresse pour accéder à votre espace propriétaire.'
            : 'Confirm your email to access your owner portal.',
          expiry: fr ? 'Ce lien expire dans 24 heures.' : 'This link expires in 24 hours.',
        },
        reset_password: {
          subject: fr ? 'Réinitialisez votre mot de passe' : 'Reset your password',
          detail: fr
            ? 'Choisissez un nouveau mot de passe pour votre compte propriétaire.'
            : 'Choose a new password for your owner account.',
          expiry: fr ? 'Ce lien expire dans 15 minutes.' : 'This link expires in 15 minutes.',
        },
        invitation: {
          subject: fr ? 'Activez votre compte B-Finance' : 'Activate your B-Finance account',
          detail: fr
            ? 'Un compte propriétaire a été créé pour vous. Choisissez votre mot de passe pour y accéder.'
            : 'An owner account was created for you. Choose your password to access it.',
          expiry: fr
            ? 'Ce lien est valable une seule fois et expire dans 72 heures.'
            : 'This link can be used once and expires in 72 hours.',
        },
      }[input.purpose]
      const { subject, detail, expiry } = text
      await provider.send({
        idempotencyKey: `owner-${input.purpose}-${createHash('sha256').update(input.url).digest('hex')}`,
        from: { email: from, name: 'B-Finance' },
        to: input.to,
        cc: [],
        subject,
        text: `${subject}\n\n${detail}\n${input.url}\n\n${expiry}`,
        html: `<!doctype html><html lang="${fr ? 'fr' : 'en'}"><body style="margin:0;background:#f7f7f5;font-family:Arial,sans-serif;color:#222"><main style="max-width:520px;margin:32px auto;padding:32px;background:white;border-radius:16px"><p style="color:#ad7d1d;font-weight:bold">B-Finance</p><h1 style="font-size:24px">${subject}</h1><p>${detail}</p><p style="margin:28px 0"><a href="${escape(input.url)}" style="display:inline-block;background:#ad7d1d;color:white;padding:12px 20px;border-radius:8px;text-decoration:none">${subject}</a></p><p style="color:#666">${expiry}</p></main></body></html>`,
        attachments: [],
      })
    },
  }
}
