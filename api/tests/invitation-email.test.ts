import { describe, expect, it } from 'vitest'

import { createOrganizationInvitationDelivery } from '../src/integrations/email/organization-invitation.js'
import { createRecordingEmailProvider } from '../src/integrations/email/transport.js'

describe('Organization invitation email', () => {
  it.each(['fr', 'en'] as const)(
    'renders escaped branded %s HTML and plaintext with the same personal link',
    async (language) => {
      const provider = createRecordingEmailProvider()
      const delivery = createOrganizationInvitationDelivery(provider, 'security@example.test')
      await delivery.send({
        to: 'invite@example.test',
        organizationName: 'Atlas <script>alert(1)</script> & Co',
        url: 'https://portal.example/organizations/demo/accept-invitation#token=secret&x=one',
        expiresAt: new Date(),
        language,
        idempotencyKey: 'staff-invitation:demo:delivery',
      })
      const message = provider.messages[0]!
      expect(message.html).toContain(`<html lang="${language}">`)
      expect(message.html).toContain('BaMoYa Finance')
      expect(message.html).toContain('&lt;script&gt;')
      expect(message.html).not.toContain('<script>')
      expect(message.html).toContain('secret&amp;x=one')
      expect(message.text).toContain('secret&x=one')
      expect(message.idempotencyKey).not.toContain('secret')
      expect(message.attachments).toEqual([])
    },
  )
})
