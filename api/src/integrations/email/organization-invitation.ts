import { escapeHtml as escape } from '../../lib/html.js'
import type { EmailProvider, OrganizationInvitationDelivery } from '../contracts.js'

export function createOrganizationInvitationDelivery(
  provider: EmailProvider,
  from: string,
): OrganizationInvitationDelivery {
  return {
    async send(input) {
      const fr = input.language === 'fr',
        subject = fr
          ? 'Votre invitation à rejoindre une organisation'
          : 'Your invitation to join an organization'
      const detail = fr
        ? 'Créez votre mot de passe pour rejoindre cette organisation. Ce lien personnel expire dans 48 heures et ne peut être utilisé qu’une fois. Votre accès reste limité à cette organisation.'
        : 'Choose your password to join this organization. This personal link expires in 48 hours and can only be used once. Your access is limited to this organization.'
      const label = fr ? 'Accepter l’invitation' : 'Accept invitation'
      await provider.send({
        idempotencyKey: input.idempotencyKey,
        from: { email: from, name: 'B-Finance' },
        to: input.to,
        cc: [],
        subject,
        text: `${subject}\n${input.organizationName}\n${detail}\n${input.url}`,
        html: `<!doctype html><html lang="${input.language}"><body style="font-family:Arial,sans-serif;background:#f7f8fa;padding:24px;color:#272b30"><main style="max-width:520px;margin:auto;background:white;border:1px solid #e5e8ed;border-radius:14px;padding:28px"><p style="color:#a77b28;font-weight:bold">B-Finance</p><h1 style="font-size:22px">${subject}</h1><h2 style="font-size:18px">${escape(input.organizationName)}</h2><p style="line-height:1.6">${detail}</p><a href="${escape(input.url)}" style="display:inline-block;background:#a77b28;color:white;border-radius:8px;padding:12px 18px;text-decoration:none">${label}</a><p style="font-size:12px;color:#687280">${fr ? 'Vous n’attendiez pas cette invitation ? Ignorez cet e-mail.' : 'Not expecting this invitation? You can ignore this email.'}</p></main></body></html>`,
        attachments: [],
      })
    },
  }
}
