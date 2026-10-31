import type { EmailProvider, OrganizationAdminDelivery } from '../contracts.js'
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export function createOrganizationAdminDelivery(
  provider: EmailProvider,
  from: string,
): OrganizationAdminDelivery {
  return {
    async send(input) {
      const fr = input.language === 'fr',
        subject = fr
          ? 'Votre accès administrateur est prêt'
          : 'Your administrator account is ready',
        detail = fr
          ? 'Ce mot de passe temporaire ne fonctionne qu’une seule fois et expire dans 24 heures. Dès votre première connexion, vous devez le remplacer par un nouveau mot de passe ; si vous quittez avant de l’avoir fait, utilisez « Mot de passe oublié ». Votre compte organisation est indépendant de votre compte BaMoYa.'
          : 'This temporary password works only once and expires in 24 hours. At your first login you must set a new password; if you leave before doing so, use "Forgot your password?". Your organization account is independent of your BaMoYa account.'
      await provider.send({
        idempotencyKey: input.idempotencyKey,
        from: { email: from, name: 'B-Finance' },
        to: input.to,
        cc: [],
        subject,
        text: `${subject}\n${input.organizationName}\n${input.to}\n${input.temporaryPassword}\n${input.loginUrl}\n${detail}`,
        html: `<!doctype html><html lang="${fr ? 'fr' : 'en'}"><body style="font-family:Arial,sans-serif;background:#f7f8fa;padding:24px;color:#272b30"><main style="max-width:520px;margin:auto;background:white;border:1px solid #e5e8ed;border-radius:14px;padding:28px"><p style="color:#a77b28;font-weight:bold">B-Finance</p><h1 style="font-size:22px">${subject}</h1><p>${escape(input.organizationName)}</p><p>${escape(input.to)}</p><p style="padding:14px;background:#f7f0e1;font-family:monospace">${escape(input.temporaryPassword)}</p><p>${detail}</p><a style="color:#a77b28" href="${escape(input.loginUrl)}">${fr ? 'Se connecter à l’organisation' : 'Log in to your organization'}</a></main></body></html>`,
        attachments: [],
      })
    },
  }
}
